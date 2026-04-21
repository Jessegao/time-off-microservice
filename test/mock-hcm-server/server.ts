import express, { Express, Request, Response, NextFunction } from 'express';

interface HcmBalance {
  employeeId: string;
  typeId: string;
  availableDays: number;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
}

interface TimeOffRequestData {
  employeeId: string;
  typeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  localRequestId: string;
}

interface HcmRequestResponse {
  hcmRequestId: string;
  status: 'CONFIRMED' | 'REJECTED';
  errorCode?: string;
  errorMessage?: string;
  hcmBalance?: number;
}

interface WebhookEvent {
  eventId: string;
  employeeId: string;
  typeId: string;
  previousBalance: number;
  newBalance: number;
  totalBalance: number;
  occurredAt: string;
  effectiveDate?: string;
}

class MockHcmServer {
  private app: Express;
  private port: number;
  private balances: Map<string, HcmBalance> = new Map();
  private requests: Map<string, HcmRequestResponse> = new Map();
  private events: WebhookEvent[] = [];
  private delay: number = 0;
  private errorRate: number = 0;
  private requestCount: number = 0;

  constructor(port: number = 3999) {
    this.port = port;
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
    this.initializeBalances();
  }

  private initializeBalances(): void {
    const defaultBalances: HcmBalance[] = [
      { employeeId: 'emp-001', typeId: 'pto', availableDays: 15, totalDays: 20, usedDays: 5, pendingDays: 0 },
      { employeeId: 'emp-001', typeId: 'sick', availableDays: 10, totalDays: 10, usedDays: 0, pendingDays: 0 },
      { employeeId: 'emp-002', typeId: 'pto', availableDays: 10, totalDays: 15, usedDays: 5, pendingDays: 0 },
    ];

    defaultBalances.forEach((b) => {
      const key = `${b.employeeId}-${b.typeId}`;
      this.balances.set(key, { ...b });
    });
  }

  private generateHcmRequestId(): string {
    return `HCM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private simulateDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delay));
  }

  private maybeThrowError(): void {
    if (this.errorRate > 0 && Math.random() < this.errorRate) {
      throw new Error('Simulated HCM error');
    }
  }

  private setupRoutes(): void {
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    this.app.get('/balances', (req: Request, res: Response) => {
      const { employeeId, typeId } = req.query;
      const key = `${employeeId}-${typeId}`;
      const balance = this.balances.get(key as string);

      if (!balance) {
        res.status(404).json({ error: 'Balance not found' });
        return;
      }

      res.json(balance);
    });

    this.app.get('/balances/all', (_req: Request, res: Response) => {
      res.json(Array.from(this.balances.values()));
    });

    this.app.post('/time-off-requests', async (req: Request, res: Response) => {
      await this.simulateDelay();
      this.requestCount++;

      const data = req.body as TimeOffRequestData;
      const key = `${data.employeeId}-${data.typeId}`;
      const balance = this.balances.get(key);

      if (!balance) {
        res.status(404).json({
          hcmRequestId: '',
          status: 'REJECTED',
          errorCode: 'NOT_FOUND',
          errorMessage: 'Employee or type not found',
        });
        return;
      }

      const effectiveAvailable = balance.availableDays - balance.pendingDays;
      if (effectiveAvailable < data.totalDays) {
        res.status(400).json({
          hcmRequestId: '',
          status: 'REJECTED',
          errorCode: 'INSUFFICIENT_BALANCE',
          errorMessage: `Balance insufficient. Available: ${effectiveAvailable}`,
          hcmBalance: effectiveAvailable,
        });
        return;
      }

      const hcmRequestId = this.generateHcmRequestId();
      balance.pendingDays += data.totalDays;

      const response: HcmRequestResponse = {
        hcmRequestId,
        status: 'CONFIRMED',
      };

      this.requests.set(data.localRequestId, response);
      res.json(response);
    });

    this.app.get('/time-off-requests/:id/status', (req: Request, res: Response) => {
      const { id } = req.params;
      const request = this.requests.get(id);

      if (!request) {
        res.status(404).json({ error: 'Request not found' });
        return;
      }

      res.json({ status: request.status, hcmId: request.hcmRequestId });
    });

    this.app.post('/webhooks/balance-changed', (req: Request, res: Response) => {
      const event = req.body as WebhookEvent;
      this.events.push(event);

      const key = `${event.employeeId}-${event.typeId}`;
      const balance = this.balances.get(key);

      if (balance) {
        balance.availableDays = event.newBalance;
        balance.totalDays = event.totalBalance;
      }

      res.json({ status: 'received', eventId: event.eventId });
    });

    this.app.post('/webhooks/request-status', (req: Request, res: Response) => {
      res.json({ status: 'received' });
    });

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Mock HCM Error:', err.message);
      res.status(500).json({ error: 'Internal server error', message: err.message });
    });
  }

  configure(options: { delay?: number; errorRate?: number }): void {
    if (options.delay !== undefined) this.delay = options.delay;
    if (options.errorRate !== undefined) this.errorRate = options.errorRate;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  getEvents(): WebhookEvent[] {
    return [...this.events];
  }

  setBalance(employeeId: string, typeId: string, balance: Partial<HcmBalance>): void {
    const key = `${employeeId}-${typeId}`;
    const existing = this.balances.get(key) || {
      employeeId,
      typeId,
      availableDays: 0,
      totalDays: 0,
      usedDays: 0,
      pendingDays: 0,
    };
    this.balances.set(key, { ...existing, ...balance });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`Mock HCM server running on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    process.exit(0);
  }
}

const PORT = parseInt(process.env.MOCK_HCM_PORT || '3999', 10);
const server = new MockHcmServer(PORT);

server.start().then(() => {
  console.log(`Mock HCM server is running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET  /health`);
  console.log(`  GET  /balances?employeeId=X&typeId=Y`);
  console.log(`  GET  /balances/all`);
  console.log(`  POST /time-off-requests`);
  console.log(`  GET  /time-off-requests/:id/status`);
  console.log(`  POST /webhooks/balance-changed`);
  console.log(`  POST /webhooks/request-status`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down Mock HCM server...');
  server.stop();
});
