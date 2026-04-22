import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ConflictService } from '../../conflict/conflict.service';
import { ConflictTicket, ConflictType, ConflictResolution } from '../../conflict/entities/conflict-ticket.entity';

@Injectable()
export class WebhookSilenceDetectorService {
  private readonly logger = new Logger(WebhookSilenceDetectorService.name);
  private lastWebhookTime: Map<string, Date> = new Map();
  private globalLastWebhook: Date = new Date();
  private readonly SILENCE_THRESHOLD_MINUTES: number;

  constructor(
    @Inject(forwardRef(() => ConflictService))
    private readonly conflictService: ConflictService,
    private readonly configService: ConfigService,
  ) {
    this.SILENCE_THRESHOLD_MINUTES =
      this.configService.get<number>('webhook.silenceThresholdMinutes') || 30;
  }

  updateWebhookReceived(employeeId: string): void {
    this.lastWebhookTime.set(employeeId, new Date());
    this.globalLastWebhook = new Date();
    this.logger.debug(`Webhook received for employee ${employeeId}`);
  }

  @Cron('*/5 * * * *')
  async checkWebhookHealth(): Promise<void> {
    const threshold = this.SILENCE_THRESHOLD_MINUTES;
    const cutoff = new Date(Date.now() - threshold * 60 * 1000);

    this.logger.debug(`Webhook health check: threshold=${threshold}min, cutoff=${cutoff.toISOString()}`);

    // Check global webhook health first
    if (this.globalLastWebhook < cutoff) {
      this.logger.error(
        `HCM webhook silence: no events received globally since ${this.globalLastWebhook.toISOString()}`,
      );

      await this.conflictService.createTicket({
        type: ConflictType.WEBHOOK_SILENCE,
        localBalance: 0,
        hcmBalance: 0,
      });
    }

    // Check per-employee webhook health
    for (const [employeeId, lastTime] of this.lastWebhookTime.entries()) {
      if (lastTime < cutoff) {
        this.logger.warn(
          `No webhook received for employee ${employeeId} since ${lastTime.toISOString()}`,
        );

        await this.conflictService.createTicket({
          type: ConflictType.WEBHOOK_SILENCE,
          localBalance: 0,
          hcmBalance: 0,
        });
      }
    }
  }
}
