import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Balance } from './entities/balance.entity';
import { BalanceService } from './balance.service';
import { BalanceController } from './balance.controller';
import { Employee } from '../employee/entities/employee.entity';
import { TimeOffType } from '../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog } from '../sync-log/entities/hcm-sync-log.entity';
import { HcmModule } from '../hcm/hcm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Balance, Employee, TimeOffType, HcmSyncLog]),
    forwardRef(() => HcmModule),
  ],
  controllers: [BalanceController],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
