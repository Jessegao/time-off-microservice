import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictTicket, ConflictType, ConflictResolution } from './entities/conflict-ticket.entity';
import { BalanceService } from '../balance/balance.service';

@Injectable()
export class ConflictService {
  private readonly logger = new Logger(ConflictService.name);

  constructor(
    @InjectRepository(ConflictTicket)
    private readonly conflictRepo: Repository<ConflictTicket>,
    @Inject(forwardRef(() => BalanceService))
    private readonly balanceService: BalanceService,
  ) {}

  async createTicket(data: {
    type: ConflictType;
    requestId?: string;
    balanceId?: string;
    localBalance: number;
    hcmBalance: number;
  }): Promise<ConflictTicket> {
    const ticket = this.conflictRepo.create({
      type: data.type,
      requestId: data.requestId || null,
      balanceId: data.balanceId || null,
      localBalance: data.localBalance,
      hcmBalance: data.hcmBalance,
      difference: Math.abs(data.localBalance - data.hcmBalance),
      resolution: ConflictResolution.PENDING_MANUAL,
    });

    return this.conflictRepo.save(ticket);
  }

  async findPendingTickets(): Promise<ConflictTicket[]> {
    return this.conflictRepo.find({
      where: { resolution: ConflictResolution.PENDING_MANUAL },
      order: { createdAt: 'DESC' },
    });
  }

  async resolveTicket(
    ticketId: string,
    resolvedBy: string,
  ): Promise<ConflictTicket> {
    const ticket = await this.conflictRepo.findOne({ where: { id: ticketId } });
    if (!ticket) {
      throw new Error(`ConflictTicket with ID ${ticketId} not found`);
    }

    ticket.resolution = ConflictResolution.AUTO_RESOLVED;
    ticket.resolvedBy = resolvedBy;
    ticket.resolvedAt = new Date();

    return this.conflictRepo.save(ticket);
  }

  async reprocessRetroactiveChange(ticketId: string): Promise<boolean> {
    const ticket = await this.conflictRepo.findOne({ where: { id: ticketId } });
    if (!ticket || ticket.type !== ConflictType.RETROACTIVE_CHANGE) {
      this.logger.warn(`Cannot reprocess ticket ${ticketId}: not a RETROACTIVE_CHANGE type`);
      return false;
    }

    const event = ticket.payload?.event;
    if (!event) {
      this.logger.warn(`Cannot reproprocess ticket ${ticketId}: no event payload`);
      return false;
    }

    try {
      await this.balanceService.applyHcmUpdate(
        ticket.balanceId!,
        event.newBalance,
        event.totalBalance,
        new Date(event.occurredAt),
      );

      ticket.resolution = ConflictResolution.AUTO_RESOLVED;
      ticket.resolvedBy = 'system';
      ticket.resolvedAt = new Date();
      await this.conflictRepo.save(ticket);

      this.logger.log(`Reprocessed RETROACTIVE_CHANGE ticket ${ticketId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to reprocess ticket ${ticketId}: ${error}`);
      return false;
    }
  }
}
