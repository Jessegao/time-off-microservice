import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { TimeOffRequestService } from './time-off-request.service';
import { TimeOffRequestController } from './time-off-request.controller';
import { Balance } from '../balance/entities/balance.entity';
import { Employee } from '../employee/entities/employee.entity';
import { TimeOffType } from '../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog } from '../sync-log/entities/hcm-sync-log.entity';
import { ConflictTicket } from '../conflict/entities/conflict-ticket.entity';
import { BalanceModule } from '../balance/balance.module';
import { HcmClientModule } from '../hcm/hcm-client/hcm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TimeOffRequest,
      Balance,
      Employee,
      TimeOffType,
      HcmSyncLog,
      ConflictTicket,
    ]),
    forwardRef(() => BalanceModule),
    HcmClientModule,
  ],
  controllers: [TimeOffRequestController],
  providers: [TimeOffRequestService],
  exports: [TimeOffRequestService],
})
export class TimeOffRequestModule {}
