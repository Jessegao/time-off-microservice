import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BalanceService } from './balance.service';
import { Balance, BalanceStatus, BalanceSource } from './entities/balance.entity';
import { Employee } from '../employee/entities/employee.entity';
import { TimeOffType } from '../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog, SyncStatus } from '../sync-log/entities/hcm-sync-log.entity';
import { HcmClientService } from '../hcm/hcm-client/hcm-client.service';

describe('BalanceService', () => {
  let service: BalanceService;
  let balanceRepo: jest.Mocked<Repository<Balance>>;
  let employeeRepo: jest.Mocked<Repository<Employee>>;
  let timeOffTypeRepo: jest.Mocked<Repository<TimeOffType>>;
  let syncLogRepo: jest.Mocked<Repository<HcmSyncLog>>;
  let dataSource: jest.Mocked<DataSource>;
  let hcmClient: jest.Mocked<HcmClientService>;

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
    hcmLastSyncedAt: new Date(),
    lastKnownHcmHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    employee: null as any,
    timeOffType: null as any,
  };

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
    accrualPolicy: { accrualRate: 1.67, accrualFrequency: 'MONTHLY', maxCarryover: 5, carryoverExpiryMonths: 12 },
    createdAt: new Date(),
    updatedAt: new Date(),
    balances: [],
    timeOffRequests: [],
  };

  beforeEach(async () => {
    const mockBalanceRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
      create: jest.fn(),
    };

    const mockEmployeeRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockTimeOffTypeRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockSyncLogRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };

    const mockEntityManager = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (manager: EntityManager) => Promise<unknown>) => {
        return cb(mockEntityManager as unknown as EntityManager);
      }),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'sync.driftThreshold': 0.5,
          'sync.criticalDriftThreshold': 2,
        };
        return config[key];
      }),
    };

    const mockHcmClient = {
      getBalance: jest.fn(),
      getAllBalances: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceService,
        { provide: getRepositoryToken(Balance), useValue: mockBalanceRepo },
        { provide: getRepositoryToken(Employee), useValue: mockEmployeeRepo },
        { provide: getRepositoryToken(TimeOffType), useValue: mockTimeOffTypeRepo },
        { provide: getRepositoryToken(HcmSyncLog), useValue: mockSyncLogRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HcmClientService, useValue: mockHcmClient },
      ],
    }).compile();

    service = module.get<BalanceService>(BalanceService);
    balanceRepo = module.get(getRepositoryToken(Balance));
    employeeRepo = module.get(getRepositoryToken(Employee));
    timeOffTypeRepo = module.get(getRepositoryToken(TimeOffType));
    syncLogRepo = module.get(getRepositoryToken(HcmSyncLog));
    dataSource = module.get(DataSource);
    hcmClient = module.get(HcmClientService);
  });

  describe('calculateEffectiveAvailable', () => {
    it('should return available minus pending days', () => {
      const balance = { ...mockBalance, availableDays: 10, pendingDays: 3 };
      const result = service.calculateEffectiveAvailable(balance);
      expect(result).toBe(7);
    });

    it('should handle zero balances correctly', () => {
      const balance = { ...mockBalance, availableDays: 0, pendingDays: 0 };
      const result = service.calculateEffectiveAvailable(balance);
      expect(result).toBe(0);
    });

    it('should return negative when pending exceeds available', () => {
      const balance = { ...mockBalance, availableDays: 5, pendingDays: 8 };
      const result = service.calculateEffectiveAvailable(balance);
      expect(result).toBe(-3);
    });
  });

  describe('getBalancesForEmployee', () => {
    it('should return balances for valid employee', async () => {
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      balanceRepo.find.mockResolvedValue([
        { ...mockBalance, timeOffType: mockTimeOffType },
      ]);

      const result = await service.getBalancesForEmployee('emp-1');

      expect(result).toHaveLength(1);
      expect(result[0].employeeId).toBe('emp-1');
      expect(result[0].effectiveAvailable).toBe(12);
    });

    it('should throw NotFoundException for invalid employee', async () => {
      employeeRepo.findOne.mockResolvedValue(null);

      await expect(service.getBalancesForEmployee('invalid')).rejects.toThrow();
    });
  });

  describe('validateBalanceForRequest', () => {
    it('should not throw when balance is sufficient', async () => {
      balanceRepo.findOne.mockResolvedValue({ ...mockBalance, pendingDays: 0 });

      await expect(
        service.validateBalanceForRequest('emp-1', 'type-1', 5),
      ).resolves.not.toThrow();
    });

    it('should throw BadRequestException when balance is insufficient', async () => {
      balanceRepo.findOne.mockResolvedValue({
        ...mockBalance,
        availableDays: 10,
        pendingDays: 8,
      });

      await expect(
        service.validateBalanceForRequest('emp-1', 'type-1', 5),
      ).rejects.toThrow();
    });

    it('should throw NotFoundException when balance does not exist', async () => {
      balanceRepo.findOne.mockResolvedValue(null);

      await expect(
        service.validateBalanceForRequest('emp-1', 'type-1', 5),
      ).rejects.toThrow();
    });
  });

  describe('applyHcmUpdate', () => {
    it('should update balance with new HCM values within threshold', async () => {
      const originalBalance = { ...mockBalance, availableDays: 15 };
      balanceRepo.findOne.mockResolvedValue(originalBalance);
      balanceRepo.save.mockImplementation(async (b) => b as Balance);

      const result = await service.applyHcmUpdate('balance-1', 15.3, 20, new Date());

      expect(result.availableDays).toBe(15.3);
      expect(result.totalDays).toBe(20);
      expect(result.status).toBe(BalanceStatus.SYNCED);
    });

    it('should mark balance as DRIFTED when difference exceeds threshold', async () => {
      const originalBalance = { ...mockBalance, availableDays: 10 };
      balanceRepo.findOne.mockResolvedValue(originalBalance);
      balanceRepo.save.mockImplementation(async (b) => b as Balance);

      const result = await service.applyHcmUpdate('balance-1', 8, 20, new Date());

      expect(result.status).toBe(BalanceStatus.DRIFTED);
    });

    it('should preserve pending days during HCM update', async () => {
      const originalBalance = { ...mockBalance, pendingDays: 3 };
      balanceRepo.findOne.mockResolvedValue(originalBalance);
      balanceRepo.save.mockImplementation(async (b) => b as Balance);

      const result = await service.applyHcmUpdate('balance-1', 15, 20, new Date());

      expect(result.pendingDays).toBe(3);
    });
  });

  describe('incrementPendingDays', () => {
    it('should call increment on repository', async () => {
      await service.incrementPendingDays('balance-1', 5);

      expect(balanceRepo.increment).toHaveBeenCalledWith(
        { id: 'balance-1' },
        'pendingDays',
        5,
      );
    });
  });

  describe('decrementPendingDays', () => {
    it('should decrement pending days correctly', async () => {
      balanceRepo.findOne.mockResolvedValue({
        ...mockBalance,
        pendingDays: 5,
      });

      await service.decrementPendingDays('emp-1', 'type-1', 3);

      expect(balanceRepo.update).toHaveBeenCalledWith('balance-1', {
        pendingDays: 2,
      });
    });

    it('should not go below zero', async () => {
      balanceRepo.findOne.mockResolvedValue({
        ...mockBalance,
        pendingDays: 2,
      });

      await service.decrementPendingDays('emp-1', 'type-1', 5);

      expect(balanceRepo.update).toHaveBeenCalledWith('balance-1', {
        pendingDays: 0,
      });
    });
  });

  describe('detectDrift', () => {
    it('should detect and flag balances exceeding drift threshold', async () => {
      balanceRepo.find.mockResolvedValue([
        {
          ...mockBalance,
          availableDays: 10,
          employee: mockEmployee,
          timeOffType: mockTimeOffType,
        },
      ]);

      hcmClient.getBalance.mockResolvedValue({
        employeeId: 'HCM-001',
        typeId: 'pto',
        availableDays: 8,
        totalDays: 20,
        usedDays: 2,
        pendingDays: 0,
      });

      const result = await service.detectDrift();

      expect(result.driftCount).toBe(1);
      expect(result.items[0].difference).toBeCloseTo(2, 0);
    });

    it('should not flag balances within tolerance', async () => {
      balanceRepo.find.mockResolvedValue([
        {
          ...mockBalance,
          availableDays: 10,
          employee: mockEmployee,
          timeOffType: mockTimeOffType,
        },
      ]);

      hcmClient.getBalance.mockResolvedValue({
        employeeId: 'HCM-001',
        typeId: 'pto',
        availableDays: 9.8,
        totalDays: 20,
        usedDays: 2,
        pendingDays: 0,
      });

      const result = await service.detectDrift();

      expect(result.driftCount).toBe(0);
    });
  });
});
