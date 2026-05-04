import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictService } from './conflict.service';
import { ConflictTicket, ConflictType, ConflictResolution } from './entities/conflict-ticket.entity';
import { BalanceService } from '../balance/balance.service';
import { Balance, BalanceStatus } from '../balance/entities/balance.entity';

describe('ConflictService', () => {
  let service: ConflictService;
  let conflictRepo: jest.Mocked<Repository<ConflictTicket>>;
  let balanceService: jest.Mocked<BalanceService>;

  const mockBalance: Balance = {
    id: 'balance-1',
    employeeId: 'emp-1',
    timeOffTypeId: 'type-1',
    availableDays: 15,
    pendingDays: 3,
    usedDays: 2,
    totalDays: 20,
    status: BalanceStatus.DRIFTED,
    source: null as any,
    hcmLastSyncedAt: new Date(),
    lastKnownHcmHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    employee: null as any,
    timeOffType: null as any,
  };

  const mockTicket: ConflictTicket = {
    id: 'ticket-1',
    type: ConflictType.RETROACTIVE_CHANGE,
    requestId: null,
    balanceId: 'balance-1',
    localBalance: 15,
    hcmBalance: 17,
    difference: 2,
    resolution: ConflictResolution.PENDING_MANUAL,
    resolvedBy: null,
    resolvedAt: null,
    payload: {
      event: {
        eventId: 'event-123',
        employeeId: 'HCM-001',
        typeId: 'pto',
        previousBalance: 15,
        newBalance: 17,
        totalBalance: 22,
        occurredAt: '2024-06-01T00:00:00Z',
        effectiveDate: '2024-06-01',
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockConflictRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockBalanceService = {
      applyHcmUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConflictService,
        { provide: getRepositoryToken(ConflictTicket), useValue: mockConflictRepo },
        { provide: BalanceService, useValue: mockBalanceService },
      ],
    }).compile();

    service = module.get<ConflictService>(ConflictService);
    conflictRepo = module.get(getRepositoryToken(ConflictTicket));
    balanceService = module.get(BalanceService);
  });

  describe('createTicket', () => {
    it('should create a conflict ticket with PENDING_MANUAL resolution', async () => {
      conflictRepo.create.mockReturnValue(mockTicket);
      conflictRepo.save.mockResolvedValue(mockTicket);

      const result = await service.createTicket({
        type: ConflictType.BALANCE_MISMATCH,
        balanceId: 'balance-1',
        localBalance: 10,
        hcmBalance: 8,
      });

      expect(result.resolution).toBe(ConflictResolution.PENDING_MANUAL);
      expect(result.difference).toBe(2);
      expect(conflictRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ConflictType.BALANCE_MISMATCH,
          balanceId: 'balance-1',
          localBalance: 10,
          hcmBalance: 8,
          difference: 2,
          resolution: ConflictResolution.PENDING_MANUAL,
        }),
      );
    });

    it('should create ticket for HCM_POST_FAILURE with requestId', async () => {
      const postFailureTicket = { ...mockTicket, id: 'ticket-2', type: ConflictType.HCM_POST_FAILURE };
      conflictRepo.create.mockReturnValue(postFailureTicket);
      conflictRepo.save.mockResolvedValue(postFailureTicket);

      await service.createTicket({
        type: ConflictType.HCM_POST_FAILURE,
        requestId: 'req-1',
        localBalance: 0,
        hcmBalance: 0,
      });

      expect(conflictRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ConflictType.HCM_POST_FAILURE,
          requestId: 'req-1',
        }),
      );
    });
  });

  describe('findPendingTickets', () => {
    it('should return only PENDING_MANUAL tickets ordered by createdAt desc', async () => {
      conflictRepo.find.mockResolvedValue([mockTicket]);

      const result = await service.findPendingTickets();

      expect(conflictRepo.find).toHaveBeenCalledWith({
        where: { resolution: ConflictResolution.PENDING_MANUAL },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual([mockTicket]);
    });

    it('should return empty array when no pending tickets', async () => {
      conflictRepo.find.mockResolvedValue([]);

      const result = await service.findPendingTickets();

      expect(result).toEqual([]);
    });
  });

  describe('resolveTicket', () => {
    it('should throw error if ticket not found', async () => {
      conflictRepo.findOne.mockResolvedValue(null);

      await expect(service.resolveTicket('invalid', 'admin')).rejects.toThrow(
        'ConflictTicket with ID invalid not found',
      );
    });

    it('should update resolution to AUTO_RESOLVED with metadata', async () => {
      conflictRepo.findOne.mockResolvedValue(mockTicket);
      conflictRepo.save.mockResolvedValue({ ...mockTicket, resolution: ConflictResolution.AUTO_RESOLVED });

      const result = await service.resolveTicket('ticket-1', 'admin');

      expect(result.resolution).toBe(ConflictResolution.AUTO_RESOLVED);
      expect(result.resolvedBy).toBe('admin');
      expect(result.resolvedAt).toBeInstanceOf(Date);
    });
  });

  describe('reprocessRetroactiveChange', () => {
    it('should return false if ticket not found', async () => {
      conflictRepo.findOne.mockResolvedValue(null);

      const result = await service.reprocessRetroactiveChange('invalid');

      expect(result).toBe(false);
    });

    it('should return false if ticket is not RETROACTIVE_CHANGE type', async () => {
      conflictRepo.findOne.mockResolvedValue({
        ...mockTicket,
        type: ConflictType.BALANCE_MISMATCH,
      });

      const result = await service.reprocessRetroactiveChange('ticket-1');

      expect(result).toBe(false);
      expect(balanceService.applyHcmUpdate).not.toHaveBeenCalled();
    });

    it('should return false if ticket has no event payload', async () => {
      conflictRepo.findOne.mockResolvedValue({
        ...mockTicket,
        payload: null,
      });

      const result = await service.reprocessRetroactiveChange('ticket-1');

      expect(result).toBe(false);
    });

    it('should apply HCM update and resolve ticket on success', async () => {
      conflictRepo.findOne.mockResolvedValue(mockTicket);
      balanceService.applyHcmUpdate.mockResolvedValue(mockBalance);
      conflictRepo.save.mockResolvedValue({ ...mockTicket, resolution: ConflictResolution.AUTO_RESOLVED });

      const result = await service.reprocessRetroactiveChange('ticket-1');

      expect(result).toBe(true);
      expect(balanceService.applyHcmUpdate).toHaveBeenCalledWith(
        'balance-1',
        17,
        22,
        expect.any(Date),
      );
      expect(conflictRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          resolution: ConflictResolution.AUTO_RESOLVED,
          resolvedBy: 'system',
          resolvedAt: expect.any(Date),
        }),
      );
    });

    it('should return false if applyHcmUpdate throws', async () => {
      conflictRepo.findOne.mockResolvedValue(mockTicket);
      balanceService.applyHcmUpdate.mockRejectedValue(new Error('Failed to apply'));

      const result = await service.reprocessRetroactiveChange('ticket-1');

      expect(result).toBe(false);
    });
  });
});