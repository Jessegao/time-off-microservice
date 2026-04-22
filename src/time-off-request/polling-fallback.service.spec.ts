import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PollingFallbackService } from './polling-fallback.service';
import { TimeOffRequest, RequestStatus } from './entities/time-off-request.entity';
import { HcmClientService } from '../hcm/hcm-client/hcm-client.service';
import { TimeOffRequestService } from './time-off-request.service';
import { ConflictTicket } from '../conflict/entities/conflict-ticket.entity';

describe('PollingFallbackService', () => {
  let service: PollingFallbackService;
  let requestRepo: jest.Mocked<Repository<TimeOffRequest>>;
  let conflictRepo: jest.Mocked<Repository<ConflictTicket>>;
  let hcmClient: jest.Mocked<HcmClientService>;
  let requestService: jest.Mocked<TimeOffRequestService>;

  const mockRequest = {
    id: 'req-1',
    employeeId: 'emp-1',
    timeOffTypeId: 'type-1',
    startDate: new Date('2024-12-23'),
    endDate: new Date('2024-12-27'),
    totalDays: 5,
    status: RequestStatus.HCM_POST_UNKNOWN,
    hcmRequestId: 'HCM-REQ-001',
    rejectionReason: null,
    requestedAt: new Date(),
    approvedAt: new Date(),
    hcmPostedAt: null,
    completedAt: null,
    createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes old
    updatedAt: new Date(),
    version: 1,
  } as TimeOffRequest;

  beforeEach(async () => {
    const mockRequestRepo = {
      find: jest.fn(),
      update: jest.fn(),
    };

    const mockConflictRepo = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockHcmClient = {
      getRequestStatus: jest.fn(),
    };

    const mockRequestService = {
      postToHcm: jest.fn(),
      cancelRequest: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'polling.maxPollAttempts': 5,
          'polling.intervalMinutes': 5,
          'polling.initialDelayMinutes': 2,
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PollingFallbackService,
        { provide: getRepositoryToken(TimeOffRequest), useValue: mockRequestRepo },
        { provide: getRepositoryToken(ConflictTicket), useValue: mockConflictRepo },
        { provide: HcmClientService, useValue: mockHcmClient },
        { provide: TimeOffRequestService, useValue: mockRequestService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PollingFallbackService>(PollingFallbackService);
    requestRepo = module.get(getRepositoryToken(TimeOffRequest));
    conflictRepo = module.get(getRepositoryToken(ConflictTicket));
    hcmClient = module.get(HcmClientService);
    requestService = module.get(TimeOffRequestService);
  });

  describe('pollUnknownRequests', () => {
    it('should not poll requests younger than initial delay', async () => {
      const youngRequest = { ...mockRequest, createdAt: new Date() }; // now
      requestRepo.find.mockResolvedValue([youngRequest]);

      await service.pollUnknownRequests();

      expect(hcmClient.getRequestStatus).not.toHaveBeenCalled();
    });

    it('should update status to HCM_POSTED when HCM confirms', async () => {
      requestRepo.find.mockResolvedValue([mockRequest]);
      hcmClient.getRequestStatus.mockResolvedValue({ status: 'CONFIRMED', hcmId: 'HCM-REQ-001' });

      await service.pollUnknownRequests();

      expect(requestRepo.update).toHaveBeenCalledWith('req-1', { status: RequestStatus.HCM_POSTED });
    });

    it('should mark as HCM_POST_FAILED after max poll attempts', async () => {
      requestRepo.find.mockResolvedValue([mockRequest]);
      hcmClient.getRequestStatus.mockResolvedValue({ status: 'PENDING' }); // not confirmed
      conflictRepo.create.mockReturnValue({} as any);
      conflictRepo.save.mockResolvedValue({} as any);
      requestService.cancelRequest.mockResolvedValue({ ...mockRequest, status: RequestStatus.CANCELLED } as TimeOffRequest);

      // Simulate max attempts reached by calling processRequest directly
      const serviceAny = service as any;
      serviceAny.pollAttempts.set('req-1', 4); // next will be 5

      await service.pollUnknownRequests();

      expect(requestService.cancelRequest).toHaveBeenCalledWith('req-1');
      expect(requestRepo.update).toHaveBeenCalledWith('req-1', { status: RequestStatus.HCM_POST_FAILED });
      expect(conflictRepo.create).toHaveBeenCalled();
    });
  });
});
