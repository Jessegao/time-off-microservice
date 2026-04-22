import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConflictTicket } from './entities/conflict-ticket.entity';
import { ConflictService } from './conflict.service';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [TypeOrmModule.forFeature([ConflictTicket]), forwardRef(() => BalanceModule)],
  providers: [ConflictService],
  exports: [ConflictService],
})
export class ConflictModule {}
