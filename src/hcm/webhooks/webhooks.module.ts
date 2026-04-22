import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { BalanceChangedHandler } from './handlers/balance-changed.handler';
import { WebhookSilenceDetectorService } from './webhook-silence-detector.service';
import { Balance } from '../../balance/entities/balance.entity';
import { Employee } from '../../employee/entities/employee.entity';
import { TimeOffType } from '../../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog } from '../../sync-log/entities/hcm-sync-log.entity';
import { ConflictTicket } from '../../conflict/entities/conflict-ticket.entity';
import { BalanceModule } from '../../balance/balance.module';
import { ConflictModule } from '../../conflict/conflict.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Balance, Employee, TimeOffType, HcmSyncLog, ConflictTicket]),
    forwardRef(() => BalanceModule),
    forwardRef(() => ConflictModule),
    ConfigModule,
  ],
  controllers: [WebhookController],
  providers: [BalanceChangedHandler, WebhookSilenceDetectorService],
  exports: [BalanceChangedHandler, WebhookSilenceDetectorService],
})
export class WebhooksModule {}
