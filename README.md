# Time-Off Microservice

A NestJS-based microservice for managing employee time-off requests with HCM (Human Capital Management) system integration.

## Overview

This microservice handles the full lifecycle of time-off requests while maintaining balance integrity with an external HCM system. It provides:

- Employee balance tracking with real-time synchronization
- Time-off request submission and approval workflows
- HCM webhook handling for balance change events
- Drift detection and automatic reconciliation
- Defensive programming patterns for robust error handling

## Technology Stack

- **Framework**: NestJS (TypeScript)
- **Database**: SQLite (better-sqlite3)
- **ORM**: TypeORM
- **Container**: Docker + docker-compose
- **API Documentation**: Swagger/OpenAPI
- **Testing**: Jest

## Project Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the application
npm run start

# Or in development mode with hot-reload
npm run start:dev
```

## Docker

```bash
# Build and run with docker-compose (includes the microservice)
docker-compose up --build

# Run only the app container
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e NODE_ENV=production \
  time-off-service
```

The API will be available at `http://localhost:3000` with Swagger docs at `http://localhost:3000/api/docs`.

## Docker Services

The `docker-compose.yml` defines the following services:

| Service | Port | Description |
|---------|------|-------------|
| `app` | 3000 | Time-Off Microservice |

Start the service:

```bash
docker-compose up --build
```

## Running Tests

```bash
# Run unit tests
npm run test

# Run tests with coverage
npm run test:cov

# Run e2e tests (requires mock HCM server)
npm run test:e2e
```

## Running Mock HCM Server

For integration testing, you can run a mock HCM server:

```bash
# Start mock HCM server on port 3999
npm run mock-hcm
```

## API Documentation

Once the application is running, Swagger documentation is available at:

```
http://localhost:3000/api/docs
```

## Key API Endpoints

### Balance Management
- `GET /api/v1/employees/:employeeId/balances` - Get employee balances
- `GET /api/v1/employees/:employeeId/balances/:typeId` - Get specific balance
- `GET /api/v1/balances/drift-report` - Get drift report
- `POST /api/v1/employees/:employeeId/balances/:typeId/reconcile` - Force reconcile

### Time-Off Requests
- `POST /api/v1/time-off-requests` - Submit new request
- `GET /api/v1/time-off-requests/:id` - Get request details
- `GET /api/v1/time-off-requests` - List requests with filters
- `POST /api/v1/time-off-requests/:id/cancel` - Cancel request

### Approval Workflow
- `GET /api/v1/approvals/pending?managerId=X` - Get pending approvals
- `POST /api/v1/approvals/:requestId/approve` - Approve request
- `POST /api/v1/approvals/:requestId/reject` - Reject request

### HCM Integration
- `POST /api/v1/hcm/webhooks/balance-changed` - Handle balance change events
- `POST /api/v1/hcm/sync/employee/:employeeId` - Sync single employee
- `POST /api/v1/hcm/sync/batch` - Trigger batch reconciliation
- `GET /api/v1/hcm/sync/logs` - View sync logs

## Architecture Highlights

### Balance Consistency
- Uses pessimistic locking when submitting requests to prevent overdraft
- Optimistic locking (version field) for concurrent updates
- Local balance validation before HCM calls

### Event-Driven Sync
- Webhook receiver for HCM balance change events
- Idempotent event processing via event deduplication
- Scheduled drift detection every 15 minutes

### Defensive Programming
- HCM client with timeout, retry, and circuit breaker
- Polling fallback when HCM response is lost
- Conflict ticket creation for manual resolution

## Project Structure

```
├── Dockerfile               # Multi-stage build for the microservice
├── docker-compose.yml       # Service orchestration (app + mock HCM)
├── .dockerignore            # Docker build exclusions
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/              # Configuration
│   ├── common/              # Filters, guards, interceptors
│   ├── employee/             # Employee entity and service
│   ├── time-off-type/        # Time-off type definitions
│   ├── balance/              # Balance management
│   ├── time-off-request/     # Request lifecycle
│   ├── approval/             # Approval workflow
│   ├── hcm/                  # HCM integration
│   │   ├── hcm-client/      # HTTP client with retry logic
│   │   ├── webhooks/        # Webhook handlers
│   │   └── sync/            # Drift detection, reconciliation
│   ├── sync-log/             # Audit logging
│   └── conflict/             # Conflict resolution
├── test/
│   └── mock-hcm-server/     # Mock HCM server
└── fixtures/
```

## License

UNLICENSED - Private
