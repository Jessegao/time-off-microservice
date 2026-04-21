import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Approval } from './entities/approval.entity';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';
import { TimeOffRequest } from '../time-off-request/entities/time-off-request.entity';
import { Employee } from '../employee/entities/employee.entity';
import { TimeOffRequestModule } from '../time-off-request/time-off-request.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Approval, TimeOffRequest, Employee]),
    forwardRef(() => TimeOffRequestModule),
  ],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
