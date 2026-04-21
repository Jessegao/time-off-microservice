# Time-Off Microservice - Technical Requirements Document (TRD)

## 1. Context

ReadyOn has a module that serves as the primary interface for employees to request time off. However, the Human Capital Management (HCM) system (like Workday or SAP) remains the "Source of Truth" for employment data.

The Problem: Keeping balances synced between two systems is notoriously difficult. If an employee has 10 days of leave and requests 2 days on ReadyOn, we need to ensure the HCM agrees they have the balance, and we must handle cases where the HCM balance changes independently (e.g., a "work anniversary" bonus).

## 2. Key Challenges

1. **Dual Source of Truth**: HCM is source of truth, but we need local balances for instant feedback
2. **Independent Balance Changes**: HCM can add days (work anniversary, year-start refresh) without ReadyOn knowledge
3. **Unreliable HCM Errors**: HCM may not always send errors back - must be defensive
4. **Race Conditions**: Concurrent requests from same employee can overdraft balance
5. **Approval Workflow**: Full lifecycle with manager approval before HCM posting
6. **Eventual Consistency**: HCM POST may succeed but response lost - need polling fallback

## 3. Technology Stack

- **Framework**: NestJS (TypeScript)
- **Database**: SQLite (with TypeORM/better-sqlite3)
- **Sync Strategy**: Event-driven with webhook subscriptions + batch reconciliation fallback
- **Testing**: Jest (unit + integration), Mock HCM server

## 4. Data Model

```
Employee ─────┬───── Balance ────── TimeOffType
              │
              └───── TimeOffRequest ──── Approval ──── Manager
```

### 4.1 Core Entities

| Entity | Key Fields | Purpose |
|--------|-----------|---------|
| Employee | id, hcmEmployeeId, location, managerId | Employee data with HCM mapping |
| TimeOffType | id, name, hcmTypeId, requiresApproval | Types like PTO, Sick, etc. |
| Balance | employeeId, typeId, availableDays, pendingDays, usedDays, version | Per-employee-per-type balance with optimistic lock |
| TimeOffRequest | id, status, totalDays, hcmRequestId, version | Request with full lifecycle status |
| Approval | requestId, approverId, status | Manager approval record |
| HcmSyncLog | syncType, hcmEventId, payload, status | Audit trail + idempotency |
| ConflictTicket | type, localBalance, hcmBalance, resolution | Manual conflict resolution tracking |

### 4.2 Balance Status Enum

`SYNCED`, `DRIFTED`, `PENDING_HCM`, `CONFLICT`

### 4.3 Request Status Enum

`DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `HCM_POSTING`, `HCM_POSTED`, `HCM_POST_FAILED`, `COMPLETED`

## 5. API Endpoints

### 5.1 Balance APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/employees/:employeeId/balances` | Get all balances for employee |
| GET | `/api/v1/employees/:employeeId/balances/:typeId` | Get specific balance by type |
| GET | `/api/v1/balances/drift-report` | Report balances with HCM drift |

### 5.2 Time-Off Request APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/time-off-requests` | Create new request |
| GET | `/api/v1/time-off-requests/:id` | Get single request |
| GET | `/api/v1/time-off-requests` | List requests (filterable) |
| POST | `/api/v1/time-off-requests/:id/submit` | Submit for approval |
| POST | `/api/v1/time-off-requests/:id/cancel` | Cancel request |

### 5.3 Approval Workflow APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/approvals/pending` | List pending approvals for manager |
| POST | `/api/v1/approvals/:requestId/approve` | Approve request |
| POST | `/api/v1/approvals/:requestId/reject` | Reject request |

### 5.4 HCM Integration APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/hcm/webhooks/balance-changed` | HCM balance change event |
| POST | `/api/v1/hcm/webhooks/request-status` | HCM request status update |
| POST | `/api/v1/hcm/sync/employee/:employeeId` | Full sync for single employee |
| POST | `/api/v1/hcm/sync/batch` | Trigger batch reconciliation |

## 6. Core Business Logic

### 6.1 Balance Checking (Defensive)

```typescript
calculateEffectiveAvailable(balance: Balance): number {
  // Always use local calculation, never trust HCM alone
  return balance.availableDays - balance.pendingDays;
}
```

### 6.2 Request Submission with Pessimistic Locking

```typescript
@Transaction()
async submitRequest(dto: CreateRequestDTO): Promise<TimeOffRequest> {
  // Pessimistic lock prevents concurrent overdraft
  const balance = await manager.findOne(Balance, {
    where: { employeeId, timeOffTypeId },
    lock: { mode: 'pessimistic_write' }  // SELECT FOR UPDATE
  });

  const effectiveAvailable = this.calculateEffectiveAvailable(balance);
  if (effectiveAvailable < dto.totalDays) {
    throw new InsufficientBalanceError({...});
  }

  // Atomically increment pending
  await manager.increment(Balance, { id: balance.id }, 'pendingDays', dto.totalDays);
  ...
}
```

### 6.3 HCM Webhook Processing (Idempotent)

```typescript
async processBalanceChanged(event: HcmBalanceEvent): Promise<void> {
  // 1. Idempotency check
  const existing = await this.syncLogRepo.findOne({ hcmEventId: event.eventId });
  if (existing?.status === 'SUCCESS') return;  // Already processed

  // 2. Timestamp ordering
  const localBalance = await this.balanceRepo.findOne({...});
  if (event.occurredAt < localBalance.hcmLastSyncedAt) {
    await this.handleRetroactiveChange(localBalance, event);
  } else {
    await this.applyBalanceUpdate(localBalance, event);
  }
}
```

### 6.4 Drift Detection (Scheduled)

```yaml
drift_detection:
  schedule: "*/15 * * * *"  # Every 15 minutes
  threshold: 0.5 days
  critical_threshold: 2 days
```

### 6.5 Partial Failure Handling (Saga)

```typescript
async executeApprovalSaga(requestId: string): Promise<void> {
  try {
    await this.step1_Approve(requestId);
    await this.step2_PostToHcm(requestId);
    await this.step3_UpdateBalanceUsed(requestId);
    await this.step4_MarkCompleted(requestId);
  } catch (error) {
    if (error.atStep === 'HCM_POST') {
      await this.requestRepo.update(requestId, { status: 'HCM_POST_FAILED' });
      await this.conflictService.createTicket(requestId, error);
    }
  }
}
```

## 7. Defensive Programming Strategy

### 7.1 HCM Client Configuration

```typescript
const HCM_CONFIG = {
  timeout: 5000,          // 5 second timeout
  retries: 3,             // 3 retry attempts
  retryDelay: 1000,       // Exponential backoff
  circuitBreaker: {
    failureThreshold: 5,  // Open after 5 failures
    resetTimeout: 60000   // Try again after 1 minute
  }
};
```

### 7.2 Key Defenses

1. **Local balance validation** before HCM calls
2. **Pessimistic locking** on balance for request submission
3. **Optimistic locking** (version field) on all entities
4. **Idempotency keys** on all HCM POST operations
5. **Event deduplication** via hcmEventId in sync log
6. **Circuit breaker** prevents cascade failures
7. **Polling fallback** when HCM response lost

## 8. Analysis of Alternatives Considered

### 8.1 Sync Strategy

| Approach | Pros | Cons |
|----------|------|------|
| Event-driven (chosen) | Real-time, scalable | More complex, needs reliable webhook delivery |
| Batch polling | Simple, reliable | Delay between changes, may miss events |
| Hybrid (chosen) | Best of both | Most complex |

### 8.2 Database Choice

| Choice | Rationale |
|--------|-----------|
| SQLite (chosen) | Lightweight, no setup, good for single-service deployment |
| PostgreSQL | Better for multi-service, production at scale |

### 8.3 Locking Strategy

- **Pessimistic locking** (SELECT FOR UPDATE): Used during request submission to prevent overdraft
- **Optimistic locking** (version field): Used on all entities to detect concurrent modifications
- **Why both**: Pessimistic for write-heavy operations, optimistic for read-heavy

## 9. Test Strategy

### 9.1 Unit Tests

**Balance Service**
- calculateEffectiveAvailable: normal, zero, negative edge cases
- applyHcmUpdate: preserves pending, detects drift
- detectDrift: flags threshold exceeded, tolerance respected

**TimeOffRequest Service**
- submitRequest: insufficient balance rejection
- submitRequest: pessimistic lock acquisition
- cancelRequest: only cancellable states allowed

**HcmSyncService**
- processBalanceWebhook: idempotency (duplicate events skipped)
- processBalanceWebhook: out-of-order handling via timestamp

### 9.2 Integration Tests (Mock HCM Server)

**Critical Scenarios**

| Test | Setup | Expected |
|------|-------|----------|
| Happy path | Create → Approve → HCM success | Status = COMPLETED |
| HCM timeout | HCM POST delayed > timeout | Status = HCM_POST_FAILED |
| HCM insufficient balance | HCM returns 400 | Conflict ticket created |
| Duplicate webhook | Same eventId sent twice | Only processed once |
| Concurrent requests | Two requests same employee | Second rejected at submit |
| Drift detection | Local=10, HCM=8 | Balance flagged DRIFTED |

## 10. Project Structure

```
src/
├── main.ts
├── app.module.ts
├── config/
├── common/          # Filters, guards, interceptors
├── employee/
│   └── entities/employee.entity.ts
├── time-off-type/
│   └── entities/time-off-type.entity.ts
├── balance/
│   ├── balance.service.ts
│   ├── balance.controller.ts
│   └── entities/balance.entity.ts
├── time-off-request/
│   ├── time-off-request.service.ts
│   ├── time-off-request.controller.ts
│   └── entities/time-off-request.entity.ts
├── approval/
│   ├── approval.service.ts
│   └── entities/approval.entity.ts
├── hcm/
│   ├── hcm.module.ts
│   ├── hcm.controller.ts
│   ├── hcm-client/           # HTTP client with circuit breaker
│   ├── webhooks/             # Webhook controllers and handlers
│   └── sync/                 # Drift detection, batch reconciliation
├── sync-log/
│   └── entities/hcm-sync-log.entity.ts
└── conflict/
    └── entities/conflict-ticket.entity.ts
test/
├── mock-hcm-server/          # Mock HCM server implementation
└── fixtures/
```

## 11. Verification

1. **Run unit tests**: `npm run test` - All business logic tested in isolation
2. **Run integration tests**: `npm run test:e2e` - Full lifecycle with mock HCM
3. **Coverage report**: `npm run test:cov` - Target >80% coverage on core services
4. **Manual verification**:
   - Submit request with sufficient balance → pending
   - Submit request with insufficient balance → rejected
   - Approve pending request → HCM called
   - HCM webhook received → balance updated
   - Drift report endpoint → shows flagged balances

## 12. Future Considerations

1. **Idempotency improvements**: Use distributed locking for multi-instance deployments
2. **Real HCM integration**: Replace mock server with actual HCM API calls
3. **Notifications**: Add email/Slack notifications for request status changes
4. **Calendar integration**: Sync with Google Calendar/Outlook
5. **Audit trail**: Enhanced logging for compliance requirements
