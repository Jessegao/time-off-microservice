import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Balance, BalanceStatus, BalanceSource } from '../../../balance/entities/balance.entity';
import { Employee } from '../../../employee/entities/employee.entity';
import { TimeOffType } from '../../../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog, SyncType, SyncDirection, SyncStatus } from '../../../sync-log/entities/hcm-sync-log.entity';
import { BalanceService } from '../../../balance/balance.service';
import { WebhookSilenceDetectorService } from '../../webhook-silence-detector.service';
import { ConflictTicket, ConflictType } from '../../../conflict/entities/conflict-ticket.entity';

export interface HcmBalanceChangedEvent {
  eventId: string;
  employeeId: string;
  typeId: string;
  previousBalance: number;
  newBalance: number;
  totalBalance: number;
  occurredAt: string;
  effectiveDate?: string;
}

@Injectable()
export class BalanceChangedHandler {
  private readonly logger = new Logger(BalanceChangedHandler.name);

  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepo: Repository<Balance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(TimeOffType)
    private readonly timeOffTypeRepo: Repository<TimeOffType>,
    @InjectRepository(HcmSyncLog)
    private readonly syncLogRepo: Repository<HcmSyncLog>,
    @InjectRepository(ConflictTicket)
    private readonly conflictRepo: Repository<ConflictTicket>,
    private readonly balanceService: BalanceService,
    @Inject(forwardRef(() => WebhookSilenceDetectorService))
    private readonly webhookSilenceDetector: WebhookSilenceDetectorService,
  ) {}

  async handle(event: HcmBalanceChangedEvent): Promise<void> {
    this.logger.log(`Processing balance changed event: ${event.eventId}`);

    // Update webhook health tracking for monitoring
    await this.webhookSilenceDetector.updateWebhookReceived(event.employeeId);

    const existingLog = await this.syncLogRepo.findOne({
      where: { hcmEventId: event.eventId },
    });

    if (existingLog?.status === SyncStatus.SUCCESS) {
      this.logger.debug(`Event ${event.eventId} already processed, skipping`);
      return;
    }

    let syncLogId: string;
    if (existingLog) {
      syncLogId = existingLog.id;
    } else {
      const syncLog = this.syncLogRepo.create({
        syncType: SyncType.WEBHOOK_EVENT,
        direction: SyncDirection.INBOUND,
        hcmEventId: event.eventId,
        payload: { ...event },
        status: SyncStatus.PENDING,
      });
      const saved = await this.syncLogRepo.save(syncLog);
      syncLogId = saved.id;
    }

    try {
      const employee = await this.employeeRepo.findOne({
        where: { hcmEmployeeId: event.employeeId },
      });

      if (!employee) {
        this.logger.warn(`Employee with HCM ID ${event.employeeId} not found`);
        await this.syncLogRepo.update(syncLogId, {
          status: SyncStatus.FAILED,
          errorMessage: `Employee not found: ${event.employeeId}`,
          processedAt: new Date(),
        });
        return;
      }

      const timeOffType = await this.timeOffTypeRepo.findOne({
        where: { hcmTypeId: event.typeId },
      });

      if (!timeOffType) {
        this.logger.warn(`TimeOffType with HCM ID ${event.typeId} not found`);
        await this.syncLogRepo.update(syncLogId, {
          status: SyncStatus.FAILED,
          errorMessage: `TimeOffType not found: ${event.typeId}`,
          processedAt: new Date(),
        });
        return;
      }

      const balance = await this.balanceRepo.findOne({
        where: { employeeId: employee.id, timeOffTypeId: timeOffType.id },
      });

      if (!balance) {
        this.logger.warn(`Balance not found for employee ${employee.id} and type ${timeOffType.id}`);
        await this.syncLogRepo.update(syncLogId, {
          status: SyncStatus.FAILED,
          errorMessage: 'Balance not found',
          processedAt: new Date(),
        });
        return;
      }

      const occurredAt = new Date(event.occurredAt);

      if (balance.hcmLastSyncedAt && occurredAt < balance.hcmLastSyncedAt) {
        this.logger.warn(`Stale event received: event time ${occurredAt} is older than last sync ${balance.hcmLastSyncedAt}`);

        const conflict = this.conflictRepo.create({
          type: ConflictType.RETROACTIVE_CHANGE,
          balanceId: balance.id,
          localBalance: Number(balance.availableDays),
          hcmBalance: event.newBalance,
          difference: Math.abs(Number(balance.availableDays) - event.newBalance),
          payload: { event },
        });
        await this.conflictRepo.save(conflict);

        await this.syncLogRepo.update(syncLogId, {
          status: SyncStatus.FAILED,
          errorMessage: 'Stale event: older than last sync timestamp',
          processedAt: new Date(),
        });
        return;
      }

      await this.balanceService.applyHcmUpdate(
        balance.id,
        event.newBalance,
        event.totalBalance,
        occurredAt,
      );

      this.logger.log(`Balance updated for employee ${employee.id}: ${event.previousBalance} -> ${event.newBalance}`);

      await this.syncLogRepo.update(syncLogId, {
        status: SyncStatus.SUCCESS,
        processedAt: new Date(),
      });
    } catch (error) {
      this.logger.error(`Failed to process balance changed event: ${error}`);
      await this.syncLogRepo.update(syncLogId, {
        status: SyncStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
