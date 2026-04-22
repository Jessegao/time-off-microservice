import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ConflictType {
  BALANCE_MISMATCH = 'BALANCE_MISMATCH',
  HCM_POST_FAILURE = 'HCM_POST_FAILURE',
  RETROACTIVE_CHANGE = 'RETROACTIVE_CHANGE',
  WEBHOOK_SILENCE = 'WEBHOOK_SILENCE',
}

export enum ConflictResolution {
  PENDING_MANUAL = 'PENDING_MANUAL',
  AUTO_RESOLVED = 'AUTO_RESOLVED',
  ESCALATED = 'ESCALATED',
}

@Entity('conflict_tickets')
export class ConflictTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'simple-enum',
    enum: ConflictType,
  })
  type: ConflictType;

  @Column({ name: 'request_id', nullable: true })
  requestId: string | null;

  @Column({ name: 'balance_id', nullable: true })
  balanceId: string | null;

  @Column({ name: 'local_balance', type: 'decimal', precision: 5, scale: 2 })
  localBalance: number;

  @Column({ name: 'hcm_balance', type: 'decimal', precision: 5, scale: 2 })
  hcmBalance: number;

  @Column({ name: 'difference', type: 'decimal', precision: 5, scale: 2 })
  difference: number;

  @Column({
    type: 'simple-enum',
    enum: ConflictResolution,
    default: ConflictResolution.PENDING_MANUAL,
  })
  resolution: ConflictResolution;

  @Column({ name: 'resolved_by', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'payload', type: 'simple-json', nullable: true })
  payload: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
