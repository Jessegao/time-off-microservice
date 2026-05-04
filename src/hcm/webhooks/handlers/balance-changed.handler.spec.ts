import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictType } from '../../conflict/entities/conflict-ticket.entity';
import { BalanceChangedHandler, HcmBalanceChangedEvent } from './balance-changed.handler';
import { Balance, BalanceStatus, BalanceSource } from '../../../balance/entities/balance.entity';
import { Employee } from '../../../employee/entities/employee.entity';
import { TimeOffType } from '../../../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog, SyncStatus } from '../../../sync-log/entities/hcm-sync-log.entity';
import { BalanceService } from '../../../balance/balance.service';
import { WebhookSilenceDetectorService } from '../webhook-silence-detector.service';
import { ConflictTicket } from '../../../conflict/entities/conflict-ticket.entity';

describe('BalanceChangedHandler', () => {
  let handler: BalanceChangedHandler;
  let balanceRepo: jest.Mocked<Repository<Balance>>;
  let employeeRepo: jest.Mocked<Repository<Employee>>;
  let timeOffTypeRepo: jest.Mocked<Repository<TimeOffType>>;
  let syncLogRepo: jest.Mocked<Repository<HcmSyncLog>>;
  let conflictRepo: jest.Mocked<Repository<ConflictTicket>>;
  let balanceService: jest.Mocked<BalanceService>;
  let webhookSilenceDetector: jest.Mocked<WebhookSilenceDetectorService>;

  const mockEmployee: Employee = {
    id: 'emp-1',
    hcmEmployeeId: 'HCM-001',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    location: 'NYC',
    managerId: 'mgr-1',
    hireDate: new Date('2020-01-01'),
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    balances: [],
    timeOffRequests: [],
  };

  const mockTimeOffType: TimeOffType = {
    id: 'type-1',
    name: 'Annual Leave',
    hcmTypeId: 'pto',
    isPaid: true,
    requiresApproval: true,
    maxConsecutiveDays: null,
    accrualPolicy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    balances: [],
    timeOffRequests: [],
  };

  const mockBalance: Balance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    timeOffTypeId: 'type-1',
    availableDays: 15,
    pendingDays: 3,
    usedDays: 2,
    totalDays: 20,
    status: BalanceStatus.SYNCED,
    source: BalanceSource.HCM,
    hcmLastSyncedAt: new Date('2024-01-01'),
    lastKnownHcmHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    employee: null as any,
    timeOffType: null as any,
  };

  const mockSyncLog: HcmSyncLog = {
    id: 'log-1',
    syncType: 'WEBHOOK_EVENT' as any,
    direction: 'INBOUND' as any,
    hcmEventId: 'event-123',
    payload: {},
    status: SyncStatus.PENDING,
    errorMessage: null,
    processedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockBalanceRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const mockEmployeeRepo = {
      findOne: jest.fn(),
    };

    const mockTimeOffTypeRepo = {
      findOne: jest.fn(),
    };

    const mockSyncLogRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const mockConflictRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockBalanceService = {
      applyHcmUpdate: jest.fn(),
    };

    const mockWebhookSilenceDetector = {
      updateWebhookReceived: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceChangedHandler,
        { provide: getRepositoryToken(Balance), useValue: mockBalanceRepo },
        { provide: getRepositoryToken(Employee), useValue: mockEmployeeRepo },
        { provide: getRepositoryToken(TimeOffType), useValue: mockTimeOffTypeRepo },
        { provide: getRepositoryToken(HcmSyncLog), useValue: mockSyncLogRepo },
        { provide: getRepositoryToken(ConflictTicket), useValue: mockConflictRepo },
        { provide: BalanceService, useValue: mockBalanceService },
        { provide: WebhookSilenceDetectorService, useValue: mockWebhookSilenceDetector },
      ],
    }).compile();

    handler = module.get<BalanceChangedHandler>(BalanceChangedHandler);
    balanceRepo = module.get(getRepositoryToken(Balance));
    employeeRepo = module.get(getRepositoryToken(Employee));
    timeOffTypeRepo = module.get(getRepositoryToken(TimeOffType));
    syncLogRepo = module.get(getRepositoryToken(HcmSyncLog));
    conflictRepo = module.get(getRepositoryToken(ConflictTicket));
    balanceService = module.get(BalanceService);
    webhookSilenceDetector = module.get(WebhookSilenceDetectorService);
  });

  describe('handle', () => {
    const baseEvent: HcmBalanceChangedEvent = {
      eventId: 'event-123',
      employeeId: 'HCM-001',
      typeId: 'pto',
      previousBalance: 15,
      newBalance: 17,
      totalBalance: 22,
      occurredAt: '2024-06-01T00:00:00Z',
    };

    it('should skip already-processed events (idempotency)', async () => {
      syncLogRepo.findOne.mockResolvedValue({
        ...mockSyncLog,
        status: SyncStatus.SUCCESS,
      });

      await handler.handle(baseEvent);

      expect(employeeRepo.findOne).not.toHaveBeenCalled();
    });

    it('should update webhook health on each event', async () => {
      syncLogRepo.findOne.mockResolvedValue(null);
      syncLogRepo.create.mockReturnValue(mockSyncLog);
      syncLogRepo.save.mockResolvedValue(mockSyncLog);
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      timeOffTypeRepo.findOne.mockResolvedValue(mockTimeOffType);
      balanceRepo.findOne.mockResolvedValue(mockBalance);
      balanceService.applyHcmUpdate.mockResolvedValue({ ...mockBalance, availableDays: 17 } as Balance);

      await handler.handle(baseEvent);

      expect(webhookSilenceDetector.updateWebhookReceived).toHaveBeenCalledWith('HCM-001');
    });

    it('should create RETROACTIVE_CHANGE conflict ticket for stale events', async () => {
      const oldEvent: HcmBalanceChangedEvent = {
        ...baseEvent,
        occurredAt: '2023-01-01T00:00:00Z', // older than hcmLastSyncedAt
      };

      syncLogRepo.findOne.mockResolvedValue(null);
      syncLogRepo.create.mockReturnValue(mockSyncLog);
      syncLogRepo.save.mockResolvedValue(mockSyncLog);
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      timeOffTypeRepo.findOne.mockResolvedValue(mockTimeOffType);
      balanceRepo.findOne.mockResolvedValue(mockBalance);
      conflictRepo.create.mockReturnValue({} as any);
      conflictRepo.save.mockResolvedValue({} as any);

      await handler.handle(oldEvent);

      expect(conflictRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ConflictType.RETROACTIVE_CHANGE,
          balanceId: 'balance-1',
          localBalance: 15,
          hcmBalance: 17,
        }),
      );
      expect(syncLogRepo.update).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({ status: SyncStatus.FAILED }),
      );
    });

    it('should handle employee not found', async () => {
      syncLogRepo.findOne.mockResolvedValue(null);
      syncLogRepo.create.mockReturnValue(mockSyncLog);
      syncLogRepo.save.mockResolvedValue(mockSyncLog);
      employeeRepo.findOne.mockResolvedValue(null);

      await handler.handle(baseEvent);

      expect(syncLogRepo.update).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({
          status: SyncStatus.FAILED,
          errorMessage: expect.stringContaining('Employee not found'),
        }),
      );
    });

    it('should handle timeOffType not found', async () => {
      syncLogRepo.findOne.mockResolvedValue(null);
      syncLogRepo.create.mockReturnValue(mockSyncLog);
      syncLogRepo.save.mockResolvedValue(mockSyncLog);
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      timeOffTypeRepo.findOne.mockResolvedValue(null);

      await handler.handle(baseEvent);

      expect(syncLogRepo.update).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({
          status: SyncStatus.FAILED,
          errorMessage: expect.stringContaining('TimeOffType not found'),
        }),
      );
    });

    it('should handle balance not found', async () => {
      syncLogRepo.findOne.mockResolvedValue(null);
      syncLogRepo.create.mockReturnValue(mockSyncLog);
      syncLogRepo.save.mockResolvedValue(mockSyncLog);
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      timeOffTypeRepo.findOne.mockResolvedValue(mockTimeOffType);
      balanceRepo.findOne.mockResolvedValue(null);

      await handler.handle(baseEvent);

      expect(syncLogRepo.update).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({
          status: SyncStatus.FAILED,
          errorMessage: 'Balance not found',
        }),
      );
    });

    it('should call balanceService.applyHcmUpdate for valid events', async () => {
      syncLogRepo.findOne.mockResolvedValue(null);
      syncLogRepo.create.mockReturnValue(mockSyncLog);
      syncLogRepo.save.mockResolvedValue(mockSyncLog);
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      timeOffTypeRepo.findOne.mockResolvedValue(mockTimeOffType);
      balanceRepo.findOne.mockResolvedValue(mockBalance);
      balanceService.applyHcmUpdate.mockResolvedValue({ ...mockBalance, availableDays: 17 } as Balance);

      await handler.handle(baseEvent);

      expect(balanceService.applyHcmUpdate).toHaveBeenCalledWith(
        'balance-1',
        17,
        22,
        expect.any(Date),
      );
      expect(syncLogRepo.update).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({ status: SyncStatus.SUCCESS }),
      );
    });

    it('should handle exceptions and mark sync as failed', async () => {
      syncLogRepo.findOne.mockResolvedValue(null);
      syncLogRepo.create.mockReturnValue(mockSyncLog);
      syncLogRepo.save.mockResolvedValue(mockSyncLog);
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      timeOffTypeRepo.findOne.mockResolvedValue(mockTimeOffType);
      balanceRepo.findOne.mockResolvedValue(mockBalance);
      balanceService.applyHcmUpdate.mockRejectedValue(new Error('Database error'));

      await handler.handle(baseEvent);

      expect(syncLogRepo.update).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({
          status: SyncStatus.FAILED,
          errorMessage: 'Database error',
        }),
      );
    });
  });
});