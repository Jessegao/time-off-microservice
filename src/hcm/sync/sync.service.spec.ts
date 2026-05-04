import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SyncService } from './sync.service';
import { Employee } from '../../employee/entities/employee.entity';
import { Balance, BalanceStatus } from '../../balance/entities/balance.entity';
import { HcmSyncLog, SyncType, SyncDirection, SyncStatus } from '../../sync-log/entities/hcm-sync-log.entity';
import { HcmClientService } from '../hcm-client/hcm-client.service';
import { BalanceService } from '../../balance/balance.service';

describe('SyncService', () => {
  let service: SyncService;
  let employeeRepo: jest.Mocked<Repository<Employee>>;
  let balanceRepo: jest.Mocked<Repository<Balance>>;
  let syncLogRepo: jest.Mocked<Repository<HcmSyncLog>>;
  let hcmClient: jest.Mocked<HcmClientService>;
  let balanceService: jest.Mocked<BalanceService>;

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

  const mockBalance: Balance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    timeOffTypeId: 'type-1',
    availableDays: 15,
    pendingDays: 3,
    usedDays: 2,
    totalDays: 20,
    status: BalanceStatus.SYNCED,
    source: null as any,
    hcmLastSyncedAt: new Date(),
    lastKnownHcmHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    employee: null as any,
    timeOffType: null as any,
  };

  beforeEach(async () => {
    const mockEmployeeRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockBalanceRepo = {
      find: jest.fn(),
    };

    const mockSyncLogRepo = {
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const mockHcmClient = {
      getBalance: jest.fn(),
    };

    const mockBalanceService = {
      detectDrift: jest.fn(),
      reconcileBalance: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'sync.batchSize': 100,
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: getRepositoryToken(Employee), useValue: mockEmployeeRepo },
        { provide: getRepositoryToken(Balance), useValue: mockBalanceRepo },
        { provide: getRepositoryToken(HcmSyncLog), useValue: mockSyncLogRepo },
        { provide: HcmClientService, useValue: mockHcmClient },
        { provide: BalanceService, useValue: mockBalanceService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
    employeeRepo = module.get(getRepositoryToken(Employee));
    balanceRepo = module.get(getRepositoryToken(Balance));
    syncLogRepo = module.get(getRepositoryToken(HcmSyncLog));
    hcmClient = module.get(HcmClientService);
    balanceService = module.get(BalanceService);
  });

  describe('syncEmployee', () => {
    it('should return failed status when employee not found', async () => {
      employeeRepo.findOne.mockResolvedValue(null);

      const result = await service.syncEmployee('invalid');

      expect(result.status).toBe('failed');
      expect(result.message).toBe('Employee not found');
    });

    it('should sync all balances for employee', async () => {
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      balanceRepo.find.mockResolvedValue([mockBalance]);
      balanceService.reconcileBalance.mockResolvedValue(mockBalance);

      const result = await service.syncEmployee('emp-1');

      expect(result.status).toBe('success');
      expect(result.message).toContain('1 balances');
      expect(balanceService.reconcileBalance).toHaveBeenCalledWith('emp-1', 'type-1');
    });

    it('should handle reconcile errors gracefully', async () => {
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      balanceRepo.find.mockResolvedValue([mockBalance]);
      balanceService.reconcileBalance.mockRejectedValue(new Error('HCM error'));

      const result = await service.syncEmployee('emp-1');

      expect(result.status).toBe('success'); // still reports overall success
      expect(result.message).toContain('1 balances');
    });
  });

  describe('batchSync', () => {
    it('should process all active employees', async () => {
      const syncLog = { id: 'log-1' } as HcmSyncLog;
      syncLogRepo.create.mockReturnValue(syncLog);
      syncLogRepo.save.mockResolvedValue(syncLog);
      employeeRepo.find.mockResolvedValue([mockEmployee]);
      balanceRepo.find.mockResolvedValue([mockBalance]);
      balanceService.reconcileBalance.mockResolvedValue(mockBalance);

      const result = await service.batchSync();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(syncLogRepo.update).toHaveBeenCalledWith(
        'log-1',
        expect.objectContaining({ status: SyncStatus.SUCCESS }),
      );
    });

    it('should count failures when sync employee fails', async () => {
      const syncLog = { id: 'log-1' } as HcmSyncLog;
      syncLogRepo.create.mockReturnValue(syncLog);
      syncLogRepo.save.mockResolvedValue(syncLog);
      employeeRepo.find.mockResolvedValue([mockEmployee]);
      balanceRepo.find.mockResolvedValue([mockBalance]);
      balanceService.reconcileBalance.mockRejectedValue(new Error('Failed'));

      const result = await service.batchSync();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should handle empty employee list', async () => {
      const syncLog = { id: 'log-1' } as HcmSyncLog;
      syncLogRepo.create.mockReturnValue(syncLog);
      syncLogRepo.save.mockResolvedValue(syncLog);
      employeeRepo.find.mockResolvedValue([]);

      const result = await service.batchSync();

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('detectDriftScheduled', () => {
    it('should call balanceService.detectDrift', async () => {
      balanceService.detectDrift.mockResolvedValue({
        items: [],
        totalChecked: 10,
        driftCount: 0,
        criticalCount: 0,
      });

      await service.detectDriftScheduled();

      expect(balanceService.detectDrift).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      balanceService.detectDrift.mockRejectedValue(new Error('Drift detection failed'));

      // Should not throw
      await service.detectDriftScheduled();
    });
  });

  describe('getSyncLogs', () => {
    it('should return sync logs ordered by createdAt desc', async () => {
      const logs = [{ id: 'log-1' }] as HcmSyncLog[];
      syncLogRepo.find.mockResolvedValue(logs);

      const result = await service.getSyncLogs(50);

      expect(syncLogRepo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 50,
      });
      expect(result).toEqual(logs);
    });
  });
});