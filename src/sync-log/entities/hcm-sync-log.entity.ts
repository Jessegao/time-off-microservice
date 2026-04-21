import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum SyncType {
  BALANCE_CHECK = 'BALANCE_CHECK',
  REQUEST_POST = 'REQUEST_POST',
  WEBHOOK_EVENT = 'WEBHOOK_EVENT',
  BATCH_RECONCILE = 'BATCH_RECONCILE',
}

export enum SyncDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum SyncStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

@Entity('hcm_sync_logs')
export class HcmSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'sync_type',
    type: 'simple-enum',
    enum: SyncType,
  })
  syncType: SyncType;

  @Column({
    name: 'direction',
    type: 'simple-enum',
    enum: SyncDirection,
  })
  direction: SyncDirection;

  @Column({ name: 'hcm_event_id', unique: true, nullable: true })
  hcmEventId: string | null;

  @Column({ type: 'simple-json' })
  payload: Record<string, unknown>;

  @Column({
    type: 'simple-enum',
    enum: SyncStatus,
    default: SyncStatus.PENDING,
  })
  status: SyncStatus;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'error_message', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'processed_at', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
