import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncService } from './sync.service';
import { Employee } from '../../employee/entities/employee.entity';
import { Balance } from '../../balance/entities/balance.entity';
import { HcmSyncLog } from '../../sync-log/entities/hcm-sync-log.entity';
import { HcmClientModule } from '../hcm-client/hcm.module';
import { BalanceModule } from '../../balance/balance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Balance, HcmSyncLog]),
    ScheduleModule.forRoot(),
    HcmClientModule,
    forwardRef(() => BalanceModule),
  ],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
