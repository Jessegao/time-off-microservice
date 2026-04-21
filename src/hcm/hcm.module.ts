import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HcmClientModule } from './hcm-client/hcm.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SyncModule } from './sync/sync.module';
import { HcmController } from './hcm.controller';
import { Balance } from '../balance/entities/balance.entity';
import { Employee } from '../employee/entities/employee.entity';
import { HcmSyncLog } from '../sync-log/entities/hcm-sync-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Balance, Employee, HcmSyncLog]),
    HcmClientModule,
    WebhooksModule,
    SyncModule,
  ],
  controllers: [HcmController],
  exports: [HcmClientModule, SyncModule],
})
export class HcmModule {}
