import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Balance } from '../../balance/entities/balance.entity';
import { TimeOffRequest } from '../../time-off-request/entities/time-off-request.entity';

@Entity('time_off_types')
export class TimeOffType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ name: 'hcm_type_id', unique: true })
  hcmTypeId: string;

  @Column({ name: 'is_paid', default: true })
  isPaid: boolean;

  @Column({ name: 'requires_approval', default: true })
  requiresApproval: boolean;

  @Column({ name: 'max_consecutive_days', type: 'integer', nullable: true })
  maxConsecutiveDays: number | null;

  @Column({ name: 'accrual_policy', type: 'simple-json' })
  accrualPolicy: {
    accrualRate: number;
    accrualFrequency: 'MONTHLY' | 'YEARLY' | 'PER_PAY_PERIOD';
    maxCarryover: number;
    carryoverExpiryMonths: number;
  };

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Balance, (balance) => balance.timeOffType)
  balances: Balance[];

  @OneToMany(() => TimeOffRequest, (request) => request.timeOffType)
  timeOffRequests: TimeOffRequest[];
}
