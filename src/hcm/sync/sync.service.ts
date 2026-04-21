import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Employee } from '../../employee/entities/employee.entity';
import { Balance, BalanceStatus } from '../../balance/entities/balance.entity';
import { HcmSyncLog, SyncType, SyncDirection, SyncStatus } from '../../sync-log/entities/hcm-sync-log.entity';
import { HcmClientService } from '../hcm-client/hcm-client.service';
import { BalanceService } from '../../balance/balance.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly batchSize: number;

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Balance)
    private readonly balanceRepo: Repository<Balance>,
    @InjectRepository(HcmSyncLog)
    private readonly syncLogRepo: Repository<HcmSyncLog>,
    private readonly hcmClient: HcmClientService,
    private readonly balanceService: BalanceService,
    private readonly configService: ConfigService,
  ) {
    this.batchSize = this.configService.get<number>('sync.batchSize') || 100;
  }

  @Cron('*/15 * * * *')
  async detectDriftScheduled(): Promise<void> {
    this.logger.log('Starting scheduled drift detection');
    try {
      const report = await this.balanceService.detectDrift();
      this.logger.log(
        `Drift detection complete: ${report.driftCount} drifts found, ${report.criticalCount} critical`,
      );
    } catch (error) {
      this.logger.error(`Drift detection failed: ${error}`);
    }
  }

  async syncEmployee(employeeId: string): Promise<{ status: string; message: string }> {
    this.logger.log(`Starting sync for employee ${employeeId}`);

    const employee = await this.employeeRepo.findOne({ where: { id: employeeId } });
    if (!employee) {
      return { status: 'failed', message: 'Employee not found' };
    }

    const balances = await this.balanceRepo.find({ where: { employeeId } });

    for (const balance of balances) {
      try {
        await this.balanceService.reconcileBalance(employeeId, balance.timeOffTypeId);
      } catch (error) {
        this.logger.error(`Failed to reconcile balance ${balance.id}: ${error}`);
      }
    }

    return { status: 'success', message: `Synced ${balances.length} balances` };
  }

  async batchSync(): Promise<{ status: string; processed: number; failed: number }> {
    this.logger.log('Starting batch sync');

    const syncLog = this.syncLogRepo.create({
      syncType: SyncType.BATCH_RECONCILE,
      direction: SyncDirection.INBOUND,
      payload: { startedAt: new Date().toISOString() },
      status: SyncStatus.PENDING,
    });
    await this.syncLogRepo.save(syncLog);

    let processed = 0;
    let failed = 0;

    try {
      const employees = await this.employeeRepo.find({ where: { isActive: true } });

      for (const employee of employees) {
        try {
          const result = await this.syncEmployee(employee.id);
          if (result.status === 'success') {
            processed++;
          } else {
            failed++;
          }
        } catch (error) {
          this.logger.error(`Failed to sync employee ${employee.id}: ${error}`);
          failed++;
        }
      }

      await this.syncLogRepo.update(syncLog.id, {
        status: SyncStatus.SUCCESS,
        payload: {
          ...syncLog.payload,
          completedAt: new Date().toISOString(),
          processed,
          failed,
        },
        processedAt: new Date(),
      });

      this.logger.log(`Batch sync complete: processed=${processed}, failed=${failed}`);

      return { status: 'success', processed, failed };
    } catch (error) {
      await this.syncLogRepo.update(syncLog.id, {
        status: SyncStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      return { status: 'failed', processed, failed };
    }
  }

  async getSyncLogs(limit = 100): Promise<HcmSyncLog[]> {
    return this.syncLogRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
