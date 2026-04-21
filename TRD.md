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

### 6.1 Balance Calculation (Defensive)

**Purpose**: Provide accurate real-time balance information to employees without trusting HCM blindly.

**How it works**:
The system maintains a local `Balance` record for each employee-timeoff-type combination. This record tracks three separate buckets:
- `availableDays`: Total allocated days minus used days
- `pendingDays`: Days reserved by requests that are submitted but not yet approved
- `usedDays`: Days from fully completed requests

The effective available balance is calculated as: `availableDays - pendingDays`

This calculation is **defensive** because:
1. It uses local data for instant feedback (no network round-trip to HCM)
2. Pending days are subtracted because those days are "reserved" even if not yet taken
3. The HCM is not consulted for this calculation, preventing potential stale data issues

### 6.2 Request Submission with Pessimistic Locking

**Purpose**: Prevent race conditions where two concurrent requests could overdraft an employee's balance.

**How it works**:
When an employee submits a time-off request, the system:

1. **Begins a database transaction** - All operations within the submission are atomic
2. **Acquires a pessimistic write lock** on the balance row using `SELECT ... FOR UPDATE`
   - This lock prevents any other transaction from reading or modifying the balance until the current transaction completes
   - Other concurrent requests will wait until this lock is released
3. **Validates the balance** - Checks if `effectiveAvailable >= requestedDays`
   - If insufficient, the transaction rolls back and returns an error immediately
4. **Atomically increments pendingDays** - The requested days are immediately reserved
5. **Creates the request record** - Status set to `PENDING`
6. **Commits the transaction** - Lock released, balance now reflects the reservation

**Why pessimistic locking?**
- Optimistic locking (version checks) would require retry logic when conflicts occur
- Pessimistic locking serialized writes at the database level, guaranteeing no overdraft
- The slight performance cost (other requests wait) is acceptable given the safety guarantee

### 6.3 HCM Webhook Processing (Idempotent)

**Purpose**: Keep local balances synchronized with HCM when HCM makes changes (e.g., work anniversary bonus days).

**How it works**:
When HCM sends a `balance-changed` webhook event:

1. **Idempotency Check**
   - Every webhook event has a unique `eventId`
   - Before processing, the system checks if this `eventId` was already processed (stored in `HcmSyncLog`)
   - If `SUCCESS` status exists: skip processing (already handled)
   - If `PENDING`/`RETRYING` status exists: return 200 but don't reprocess (deduplication)
   - If new: create a `PENDING` log entry and proceed

2. **Timestamp-Based Ordering**
   - Events carry an `occurredAt` timestamp from HCM
   - If `event.occurredAt < balance.hcmLastSyncedAt`: the event is older than our last known sync
     - This is a **retroactive change** requiring special handling (e.g., anniversary was backdated)
     - The system must recalculate impact on any existing pending/approved requests
   - If `event.occurredAt >= balance.hcmLastSyncedAt`: normal forward update

3. **Balance Update**
   - The local balance is updated with HCM's new values
   - `hcmLastSyncedAt` is set to the event's `occurredAt`
   - Status is set to `SYNCED` (or `DRIFTED` if difference exceeds threshold)

4. **Logging**
   - The sync log entry is updated to `SUCCESS` with `processedAt` timestamp

**Why idempotency matters**: Webhook delivery is not guaranteed to be exactly-once. Network retries may deliver the same event multiple times. The idempotency check ensures safe reprocessing.

### 6.4 Drift Detection (Scheduled)

**Purpose**: Actively detect when local balances have diverged from HCM, catching missed webhooks or HCM changes we didn't receive.

**How it works**:
A scheduled job runs every 15 minutes to:

1. **Query all balances** - Iterate through every local balance record
2. **Call HCM for current value** - For each balance, query HCM's real-time API
3. **Compare values** - Calculate the absolute difference between local and HCM
4. **Classify the drift**:
   - Difference <= 0.5 days: Within tolerance, no action
   - Difference > 0.5 but <= 2 days: Mark as `DRIFTED`, alert for review
   - Difference > 2 days: Mark as `CONFLICT`, escalate immediately
5. **Generate report** - Provide operations team with a list of all drifts found

**Why 0.5 and 2 day thresholds?**:
- 0.5 days accounts for rounding differences and timing windows
- 2 days flags potentially serious discrepancies that need urgent attention

### 6.5 Approval Workflow and HCM Posting

**Purpose**: Manage the lifecycle from employee request through manager approval to HCM notification.

**How it works**:

**Step 1: Manager Approval**
- Manager retrieves pending approvals for their direct reports
- Manager can approve or reject with optional comments
- On approval: request status → `APPROVED`, `approvedAt` timestamp set
- On rejection: request status → `REJECTED`, `rejectionReason` set, pending days released

**Step 2: HCM Posting**
- After approval, the system automatically posts to HCM
- Uses idempotency key (the local request ID) to prevent duplicates
- HCM responds with `CONFIRMED` or `REJECTED`
- On `CONFIRMED`: request status → `HCM_POSTED`, `hcmRequestId` stored
- On `REJECTED`: request status → `HCM_POST_FAILED`, conflict ticket created

**Step 3: Request Completion**
- When the time-off dates actually arrive (or via a scheduled job)
- Pending days are moved to used days: `pendingDays -= days`, `usedDays += days`
- Request status → `COMPLETED`

### 6.6 Conflict Resolution

**Purpose**: Handle cases where HCM and ReadyOn disagree, requiring manual intervention.

**How it works**:
When a conflict is detected (HCM rejects our post, or drift exceeds threshold):

1. A `ConflictTicket` is created with:
   - Type (e.g., `BALANCE_MISMATCH`, `HCM_POST_FAILURE`)
   - The local balance vs. HCM balance
   - The difference magnitude
   - Resolution status: `PENDING_MANUAL`

2. The ticket appears in an operations dashboard

3. An analyst reviews and resolves by:
   - Adjusting the local balance to match HCM, OR
   - Manually posting to HCM with corrected data, OR
   - Escalating to HR

4. Resolution is recorded with `resolvedBy` and `resolvedAt` timestamps

**Why manual resolution?**:
- These are edge cases that automated systems shouldn't guess at
- HR or management may need to make judgment calls (e.g., approving an exception)
- Audit trail is important for compliance

### 6.7 Batch Reconciliation

**Purpose**: Catch any drift that webhooks missed, ensuring periodic full synchronization.

**How it works**:
A batch job can be triggered manually or on a schedule:

1. **Fetch full corpus** from HCM's batch endpoint (returns all employee balances)
2. **For each balance in HCM**:
   - Find matching local balance by `employeeId` + `timeOffTypeId`
   - If local doesn't exist: create it
   - If local differs from HCM: apply HCM's value (using same drift logic)
3. **For each local balance not in HCM corpus**:
   - HCM may have deleted or archived the record
   - Mark as `CONFLICT` for investigation
4. **Report results**: processed count, failed count, drift summary

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
