import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictTicket } from './entities/conflict-ticket.entity';
import { ConflictService } from './conflict.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConflictTicket])],
  providers: [ConflictService],
  exports: [ConflictService],
})
export class ConflictModule {}
