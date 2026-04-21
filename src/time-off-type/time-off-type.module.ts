import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffType } from './entities/time-off-type.entity';
import { TimeOffTypeService } from './time-off-type.service';

@Module({
  imports: [TypeOrmModule.forFeature([TimeOffType])],
  providers: [TimeOffTypeService],
  exports: [TimeOffTypeService],
})
export class TimeOffTypeModule {}
