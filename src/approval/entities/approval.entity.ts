import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Employee } from '../../employee/entities/employee.entity';
import { TimeOffRequest } from '../../time-off-request/entities/time-off-request.entity';

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('approvals')
export class Approval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'request_id' })
  requestId: string;

  @Column({ name: 'approver_id' })
  approverId: string;

  @Column({
    type: 'simple-enum',
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING,
  })
  status: ApprovalStatus;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ name: 'decided_at', type: 'datetime', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => TimeOffRequest, (request) => request.approvals)
  @JoinColumn({ name: 'request_id' })
  timeOffRequest: TimeOffRequest;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'approver_id' })
  approver: Employee;
}
