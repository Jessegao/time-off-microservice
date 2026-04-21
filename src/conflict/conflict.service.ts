import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictTicket, ConflictType, ConflictResolution } from './entities/conflict-ticket.entity';

@Injectable()
export class ConflictService {
  constructor(
    @InjectRepository(ConflictTicket)
    private readonly conflictRepo: Repository<ConflictTicket>,
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
}
