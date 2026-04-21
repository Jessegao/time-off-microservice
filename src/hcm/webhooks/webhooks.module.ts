import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookController } from './webhook.controller';
import { BalanceChangedHandler } from './handlers/balance-changed.handler';
import { Balance } from '../../balance/entities/balance.entity';
import { Employee } from '../../employee/entities/employee.entity';
import { TimeOffType } from '../../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog } from '../../sync-log/entities/hcm-sync-log.entity';
import { BalanceModule } from '../../balance/balance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Balance, Employee, TimeOffType, HcmSyncLog]),
    forwardRef(() => BalanceModule),
  ],
  controllers: [WebhookController],
  providers: [BalanceChangedHandler],
  exports: [BalanceChangedHandler],
})
export class WebhooksModule {}
