import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TimeOffRequest, RequestStatus } from './entities/time-off-request.entity';
import { HcmClientService } from '../hcm/hcm-client/hcm-client.service';
import { TimeOffRequestService } from './time-off-request.service';
import { ConflictTicket, ConflictType, ConflictResolution } from '../conflict/entities/conflict-ticket.entity';

@Injectable()
export class PollingFallbackService {
  private readonly logger = new Logger(PollingFallbackService.name);
  private pollAttempts: Map<string, number> = new Map();
  private readonly MAX_POLL_ATTEMPTS: number;
  private readonly POLL_INTERVAL_MINUTES: number;
  private readonly INITIAL_DELAY_MINUTES: number;

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    @InjectRepository(ConflictTicket)
    private readonly conflictRepo: Repository<ConflictTicket>,
    private readonly hcmClient: HcmClientService,
    @Inject(forwardRef(() => TimeOffRequestService))
    private readonly requestService: TimeOffRequestService,
    private readonly configService: ConfigService,
  ) {
    this.MAX_POLL_ATTEMPTS = this.configService.get<number>('polling.maxPollAttempts') || 5;
    this.POLL_INTERVAL_MINUTES = this.configService.get<number>('polling.intervalMinutes') || 5;
    this.INITIAL_DELAY_MINUTES = this.configService.get<number>('polling.initialDelayMinutes') || 2;
  }

  @Cron('*/5 * * * *')
  async pollUnknownRequests(): Promise<void> {
    this.logger.debug('Polling fallback: checking HCM_POST_UNKNOWN requests');

    const cutoff = new Date(Date.now() - this.INITIAL_DELAY_MINUTES * 60 * 1000);
    const requests = await this.requestRepo.find({
      where: { status: RequestStatus.HCM_POST_UNKNOWN },
    });

    for (const request of requests) {
      try {
        await this.processRequest(request, cutoff);
      } catch (error) {
        this.logger.error(`Error polling request ${request.id}: ${error}`);
      }
    }
  }

  private async processRequest(request: TimeOffRequest, cutoff: Date): Promise<void> {
    if (request.createdAt > cutoff) {
      this.logger.debug(`Skipping poll for request ${request.id}: too young`);
      return;
    }

    const attempts = (this.pollAttempts.get(request.id) || 0) + 1;
    this.pollAttempts.set(request.id, attempts);

    const lookupId = request.hcmRequestId || request.id;
    const result = await this.hcmClient.getRequestStatus(lookupId);

    if (result.status === 'CONFIRMED') {
      await this.requestRepo.update(request.id, { status: RequestStatus.HCM_POSTED });
      this.pollAttempts.delete(request.id);
      this.logger.log(`PollingFallback: HCM confirmed request ${request.id}`);
    } else if (attempts >= this.MAX_POLL_ATTEMPTS) {
      // Max polls reached - rollback pending days and mark as failed
      try {
        await this.requestService.cancelRequest(request.id);
      } catch (e) {
        this.logger.warn(`cancelRequest failed for ${request.id} (may already be cancelled): ${e}`);
      }

      await this.requestRepo.update(request.id, { status: RequestStatus.HCM_POST_FAILED });

      const conflict = this.conflictRepo.create({
        type: ConflictType.HCM_POST_FAILURE,
        requestId: request.id,
        localBalance: 0,
        hcmBalance: 0,
        difference: 0,
      });
      await this.conflictRepo.save(conflict);

      this.pollAttempts.delete(request.id);
      this.logger.warn(`PollingFallback: max attempts reached for ${request.id}, marked HCM_POST_FAILED`);
    } else {
      this.logger.debug(`PollingFallback: request ${request.id} not yet confirmed (attempt ${attempts})`);
    }
  }
}
