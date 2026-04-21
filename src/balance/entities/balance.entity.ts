import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  VersionColumn,
  Index,
} from 'typeorm';
import { Employee } from '../../employee/entities/employee.entity';
import { TimeOffType } from '../../time-off-type/entities/time-off-type.entity';

export enum BalanceStatus {
  SYNCED = 'SYNCED',
  DRIFTED = 'DRIFTED',
  PENDING_HCM = 'PENDING_HCM',
  CONFLICT = 'CONFLICT',
}

export enum BalanceSource {
  HCM = 'HCM',
  MANUAL = 'MANUAL',
  CALCULATED = 'CALCULATED',
}

@Entity('balances')
@Index(['employeeId', 'timeOffTypeId'], { unique: true })
export class Balance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'time_off_type_id' })
  timeOffTypeId: string;

  @Column({ name: 'available_days', type: 'decimal', precision: 5, scale: 2 })
  availableDays: number;

  @Column({ name: 'pending_days', type: 'decimal', precision: 5, scale: 2 })
  pendingDays: number;

  @Column({ name: 'used_days', type: 'decimal', precision: 5, scale: 2 })
  usedDays: number;

  @Column({ name: 'total_days', type: 'decimal', precision: 5, scale: 2 })
  totalDays: number;

  @Column({
    type: 'simple-enum',
    enum: BalanceStatus,
    default: BalanceStatus.SYNCED,
  })
  status: BalanceStatus;

  @Column({
    type: 'simple-enum',
    enum: BalanceSource,
    default: BalanceSource.HCM,
  })
  source: BalanceSource;

  @Column({ name: 'hcm_last_synced_at', nullable: true })
  hcmLastSyncedAt: Date | null;

  @Column({ name: 'last_known_hcm_hash', nullable: true })
  lastKnownHcmHash: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;

  @ManyToOne(() => Employee, (employee) => employee.balances)
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => TimeOffType, (type) => type.balances)
  @JoinColumn({ name: 'time_off_type_id' })
  timeOffType: TimeOffType;
}
