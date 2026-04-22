import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  VersionColumn,
  OneToMany,
} from 'typeorm';
import { Employee } from '../../employee/entities/employee.entity';
import { TimeOffType } from '../../time-off-type/entities/time-off-type.entity';
import { Approval } from '../../approval/entities/approval.entity';

export enum RequestStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  HCM_POSTING = 'HCM_POSTING',
  HCM_POSTED = 'HCM_POSTED',
  HCM_POST_UNKNOWN = 'HCM_POST_UNKNOWN',
  HCM_POST_FAILED = 'HCM_POST_FAILED',
  COMPLETED = 'COMPLETED',
}

@Entity('time_off_requests')
export class TimeOffRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'time_off_type_id' })
  timeOffTypeId: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ name: 'total_days', type: 'decimal', precision: 5, scale: 2 })
  totalDays: number;

  @Column({
    type: 'simple-enum',
    enum: RequestStatus,
    default: RequestStatus.DRAFT,
  })
  status: RequestStatus;

  @Column({ name: 'hcm_request_id', unique: true, nullable: true })
  hcmRequestId: string | null;

  @Column({ name: 'rejection_reason', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'requested_at' })
  requestedAt: Date;

  @Column({ name: 'approved_at', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'hcm_posted_at', nullable: true })
  hcmPostedAt: Date | null;

  @Column({ name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;

  @ManyToOne(() => Employee, (employee) => employee.timeOffRequests)
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @ManyToOne(() => TimeOffType, (type) => type.timeOffRequests)
  @JoinColumn({ name: 'time_off_type_id' })
  timeOffType: TimeOffType;

  @OneToMany(() => Approval, (approval) => approval.timeOffRequest)
  approvals: Approval[];
}
