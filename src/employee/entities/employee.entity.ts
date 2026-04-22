import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  VersionColumn,
} from 'typeorm';
import { Balance } from '../../balance/entities/balance.entity';
import { TimeOffRequest } from '../../time-off-request/entities/time-off-request.entity';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'hcm_employee_id', unique: true })
  hcmEmployeeId: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column()
  location: string;

  @Column({ name: 'manager_id', type: 'text', nullable: true })
  managerId: string | null;

  @Column({ name: 'hire_date', type: 'date' })
  hireDate: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;

  @OneToMany(() => Balance, (balance) => balance.employee)
  balances: Balance[];

  @OneToMany(() => TimeOffRequest, (request) => request.employee)
  timeOffRequests: TimeOffRequest[];
}
