import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { Approval, ApprovalStatus } from './entities/approval.entity';
import { TimeOffRequest, RequestStatus } from '../time-off-request/entities/time-off-request.entity';
import { Employee } from '../employee/entities/employee.entity';
import { TimeOffRequestService } from '../time-off-request/time-off-request.service';

describe('ApprovalService', () => {
  let service: ApprovalService;
  let approvalRepo: jest.Mocked<Repository<Approval>>;
  let requestRepo: jest.Mocked<Repository<TimeOffRequest>>;
  let employeeRepo: jest.Mocked<Repository<Employee>>;
  let requestService: jest.Mocked<TimeOffRequestService>;

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

  const mockTimeOffRequest: TimeOffRequest = {
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
    timeOffType: null as any,
    approvals: [],
  };

  const mockApproval: Approval = {
    id: 'approval-1',
    requestId: 'req-1',
    approverId: 'mgr-1',
    status: ApprovalStatus.PENDING,
    comments: null,
    decidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    timeOffRequest: mockTimeOffRequest,
    approver: mockEmployee,
  };

  beforeEach(async () => {
    const mockApprovalRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const mockRequestRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const mockEmployeeRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockRequestService = {
      postToHcm: jest.fn(),
      cancelRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalService,
        { provide: getRepositoryToken(Approval), useValue: mockApprovalRepo },
        { provide: getRepositoryToken(TimeOffRequest), useValue: mockRequestRepo },
        { provide: getRepositoryToken(Employee), useValue: mockEmployeeRepo },
        { provide: TimeOffRequestService, useValue: mockRequestService },
      ],
    }).compile();

    service = module.get<ApprovalService>(ApprovalService);
    approvalRepo = module.get(getRepositoryToken(Approval));
    requestRepo = module.get(getRepositoryToken(TimeOffRequest));
    employeeRepo = module.get(getRepositoryToken(Employee));
    requestService = module.get(TimeOffRequestService);
  });

  describe('getPendingApprovalsForManager', () => {
    it('should throw NotFoundException for invalid manager', async () => {
      employeeRepo.findOne.mockResolvedValue(null);

      await expect(service.getPendingApprovalsForManager('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array when no direct reports', async () => {
      employeeRepo.findOne.mockResolvedValue({ ...mockEmployee, id: 'mgr-1' });
      employeeRepo.find.mockResolvedValue([]);

      const result = await service.getPendingApprovalsForManager('mgr-1');

      expect(result).toEqual([]);
    });
  });

  describe('approveRequest', () => {
    it('should throw NotFoundException for invalid request', async () => {
      requestRepo.findOne.mockResolvedValue(null);

      await expect(
        service.approveRequest('invalid', 'mgr-1', { approverId: 'mgr-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectRequest', () => {
    it('should throw NotFoundException for invalid request', async () => {
      requestRepo.findOne.mockResolvedValue(null);

      await expect(
        service.rejectRequest('invalid', 'mgr-1', { approverId: 'mgr-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
