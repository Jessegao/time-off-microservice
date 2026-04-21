import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import { EmployeeModule } from './employee/employee.module';
import { TimeOffTypeModule } from './time-off-type/time-off-type.module';
import { BalanceModule } from './balance/balance.module';
import { TimeOffRequestModule } from './time-off-request/time-off-request.module';
import { ApprovalModule } from './approval/approval.module';
import { HcmModule } from './hcm/hcm.module';
import { ConflictModule } from './conflict/conflict.module';
import { Employee } from './employee/entities/employee.entity';
import { TimeOffType } from './time-off-type/entities/time-off-type.entity';
import { Balance } from './balance/entities/balance.entity';
import { TimeOffRequest } from './time-off-request/entities/time-off-request.entity';
import { Approval } from './approval/entities/approval.entity';
import { HcmSyncLog } from './sync-log/entities/hcm-sync-log.entity';
import { ConflictTicket } from './conflict/entities/conflict-ticket.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database: configService.get<string>('database.path') || './data/time-off-service.sqlite',
        entities: [
          Employee,
          TimeOffType,
          Balance,
          TimeOffRequest,
          Approval,
          HcmSyncLog,
          ConflictTicket,
        ],
        synchronize: true,
        logging: process.env.NODE_ENV !== 'production',
      }),
    }),
    EmployeeModule,
    TimeOffTypeModule,
    BalanceModule,
    TimeOffRequestModule,
    ApprovalModule,
    HcmModule,
    ConflictModule,
  ],
})
export class AppModule {}
