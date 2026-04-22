import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TimeOffRequestService } from './time-off-request.service';
import { TimeOffRequest, RequestStatus } from './entities/time-off-request.entity';
import { Balance, BalanceStatus } from '../balance/entities/balance.entity';
import { Employee } from '../employee/entities/employee.entity';
import { TimeOffType } from '../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog } from '../sync-log/entities/hcm-sync-log.entity';
import { ConflictTicket } from '../conflict/entities/conflict-ticket.entity';
import { BalanceService } from '../balance/balance.service';
import { HcmClientService } from '../hcm/hcm-client/hcm-client.service';

describe('TimeOffRequestService', () => {
  let service: TimeOffRequestService;
  let requestRepo: jest.Mocked<Repository<TimeOffRequest>>;
  let balanceRepo: jest.Mocked<Repository<Balance>>;
  let employeeRepo: jest.Mocked<Repository<Employee>>;
  let timeOffTypeRepo: jest.Mocked<Repository<TimeOffType>>;
  let syncLogRepo: jest.Mocked<Repository<HcmSyncLog>>;
  let conflictRepo: jest.Mocked<Repository<ConflictTicket>>;
  let balanceService: jest.Mocked<BalanceService>;
  let hcmClient: jest.Mocked<HcmClientService>;

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

  const mockBalance: Balance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    timeOffTypeId: 'type-1',
    availableDays: 15,
    pendingDays: 0,
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

  const mockRequest: TimeOffRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    timeOffTypeId: 'type-1',
    startDate: new Date('2024-12-23'),
    endDate: new Date('2024-12-27'),
    totalDays: 5,
    status: RequestStatus.PENDING,
    hcmRequestId: null,
    rejectionReason: null,
    requestedAt: new Date(),
    approvedAt: null,
    hcmPostedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    employee: mockEmployee,
    timeOffType: mockTimeOffType,
    approvals: [],
  };

  beforeEach(async () => {
    const mockRequestRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };

    const mockBalanceRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
    };

    const mockEmployeeRepo = {
      findOne: jest.fn(),
    };

    const mockTimeOffTypeRepo = {
      findOne: jest.fn(),
    };

    const mockSyncLogRepo = {
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const mockConflictRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockBalanceService = {
      calculateEffectiveAvailable: jest.fn().mockReturnValue(15),
      decrementPendingDays: jest.fn(),
      moveToUsedDays: jest.fn(),
    };

    const mockHcmClient = {
      postTimeOffRequest: jest.fn(),
    };

    const mockEntityManager = {
      findOne: jest.fn().mockResolvedValue({ ...mockBalance }),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn(),
      create: jest.fn().mockImplementation((entityClass, data) => data),
    };

    const mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (manager: EntityManager) => Promise<unknown>) => {
        return cb(mockEntityManager as unknown as EntityManager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeOffRequestService,
        { provide: getRepositoryToken(TimeOffRequest), useValue: mockRequestRepo },
        { provide: getRepositoryToken(Balance), useValue: mockBalanceRepo },
        { provide: getRepositoryToken(Employee), useValue: mockEmployeeRepo },
        { provide: getRepositoryToken(TimeOffType), useValue: mockTimeOffTypeRepo },
        { provide: getRepositoryToken(HcmSyncLog), useValue: mockSyncLogRepo },
        { provide: getRepositoryToken(ConflictTicket), useValue: mockConflictRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: BalanceService, useValue: mockBalanceService },
        { provide: HcmClientService, useValue: mockHcmClient },
      ],
    }).compile();

    service = module.get<TimeOffRequestService>(TimeOffRequestService);
    requestRepo = module.get(getRepositoryToken(TimeOffRequest));
    balanceRepo = module.get(getRepositoryToken(Balance));
    employeeRepo = module.get(getRepositoryToken(Employee));
    timeOffTypeRepo = module.get(getRepositoryToken(TimeOffType));
    syncLogRepo = module.get(getRepositoryToken(HcmSyncLog));
    conflictRepo = module.get(getRepositoryToken(ConflictTicket));
    balanceService = module.get(BalanceService);
    hcmClient = module.get(HcmClientService);
  });

  describe('createRequest', () => {
    it('should create a request with PENDING status', async () => {
      employeeRepo.findOne.mockResolvedValue(mockEmployee);
      timeOffTypeRepo.findOne.mockResolvedValue(mockTimeOffType);
      requestRepo.create.mockReturnValue(mockRequest);
      requestRepo.save.mockResolvedValue(mockRequest);

      const result = await service.createRequest({
        employeeId: 'emp-1',
        timeOffTypeId: 'type-1',
        startDate: '2024-12-23',
        endDate: '2024-12-27',
        totalDays: 5,
      });

      expect(result.status).toBe(RequestStatus.PENDING);
      expect(requestRepo.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid employee', async () => {
      employeeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createRequest({
          employeeId: 'invalid',
          timeOffTypeId: 'type-1',
          startDate: '2024-12-23',
          endDate: '2024-12-27',
          totalDays: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelRequest', () => {
    it('should cancel a PENDING request', async () => {
      requestRepo.findOne.mockResolvedValue(mockRequest);
      balanceService.decrementPendingDays.mockResolvedValue();
      requestRepo.save.mockImplementation(async (r) => r as TimeOffRequest);

      const result = await service.cancelRequest('req-1');

      expect(result.status).toBe(RequestStatus.CANCELLED);
      expect(balanceService.decrementPendingDays).toHaveBeenCalledWith('emp-1', 'type-1', 5);
    });

    it('should throw BadRequestException for non-cancellable status', async () => {
      requestRepo.findOne.mockResolvedValue({
        ...mockRequest,
        status: RequestStatus.APPROVED,
      });

      await expect(service.cancelRequest('req-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for invalid request', async () => {
      requestRepo.findOne.mockResolvedValue(null);

      await expect(service.cancelRequest('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('postToHcm', () => {
    it('should update status to HCM_POSTED on success', async () => {
      requestRepo.findOne.mockResolvedValue(mockRequest);
      hcmClient.postTimeOffRequest.mockResolvedValue({
        hcmRequestId: 'HCM-REQ-001',
        status: 'CONFIRMED',
      });
      requestRepo.update.mockResolvedValue({ affected: 1 } as any);
      requestRepo.save.mockImplementation(async (r) => r as TimeOffRequest);
      syncLogRepo.create.mockReturnValue({} as any);
      syncLogRepo.save.mockResolvedValue({} as any);

      const result = await service.postToHcm('req-1');

      expect(result.status).toBe(RequestStatus.HCM_POSTED);
      expect(result.hcmRequestId).toBe('HCM-REQ-001');
    });

    it('should handle HCM rejection with conflict ticket', async () => {
      requestRepo.findOne.mockResolvedValue(mockRequest);
      hcmClient.postTimeOffRequest.mockResolvedValue({
        hcmRequestId: '',
        status: 'REJECTED',
        errorCode: 'INSUFFICIENT_BALANCE',
        errorMessage: 'Balance insufficient',
        hcmBalance: 2,
      });
      requestRepo.update.mockResolvedValue({ affected: 1 } as any);
      requestRepo.save.mockImplementation(async (r) => r as TimeOffRequest);
      syncLogRepo.create.mockReturnValue({} as any);
      syncLogRepo.save.mockResolvedValue({} as any);
      conflictRepo.create.mockReturnValue({} as any);
      conflictRepo.save.mockResolvedValue({} as any);

      const result = await service.postToHcm('req-1');

      expect(result.status).toBe(RequestStatus.HCM_POST_FAILED);
      expect(conflictRepo.create).toHaveBeenCalled();
    });

    it('should set HCM_POST_UNKNOWN when HCM throws', async () => {
      requestRepo.findOne.mockResolvedValue(mockRequest);
      hcmClient.postTimeOffRequest.mockRejectedValue(new Error('HCM timeout'));
      requestRepo.update.mockResolvedValue({ affected: 1 } as any);
      requestRepo.save.mockImplementation(async (r) => r as TimeOffRequest);
      syncLogRepo.create.mockReturnValue({} as any);
      syncLogRepo.save.mockResolvedValue({} as any);

      await expect(service.postToHcm('req-1')).rejects.toThrow('HCM timeout');

      // Status should be HCM_POST_UNKNOWN so polling fallback can determine outcome
      expect(requestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: RequestStatus.HCM_POST_UNKNOWN }),
      );
    });
  });

  describe('getRequestById', () => {
    it('should return request details', async () => {
      requestRepo.findOne.mockResolvedValue({
        ...mockRequest,
        timeOffType: mockTimeOffType,
      });

      const result = await service.getRequestById('req-1');

      expect(result.id).toBe('req-1');
      expect(result.timeOffTypeName).toBe('Annual Leave');
    });

    it('should throw NotFoundException for invalid request', async () => {
      requestRepo.findOne.mockResolvedValue(null);

      await expect(service.getRequestById('invalid')).rejects.toThrow(NotFoundException);
    });
  });
});
