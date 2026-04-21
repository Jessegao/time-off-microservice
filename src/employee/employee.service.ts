import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';

@Injectable()
export class EmployeeService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  async findById(id: string): Promise<Employee> {
    const employee = await this.employeeRepo.findOne({ where: { id } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${id} not found`);
    }
    return employee;
  }

  async findByHcmId(hcmEmployeeId: string): Promise<Employee> {
    const employee = await this.employeeRepo.findOne({ where: { hcmEmployeeId } });
    if (!employee) {
      throw new NotFoundException(`Employee with HCM ID ${hcmEmployeeId} not found`);
    }
    return employee;
  }

  async findByManagerId(managerId: string): Promise<Employee[]> {
    return this.employeeRepo.find({ where: { managerId, isActive: true } });
  }

  async findAll(): Promise<Employee[]> {
    return this.employeeRepo.find({ where: { isActive: true } });
  }

  async getManager(managerId: string): Promise<Employee | null> {
    if (!managerId) return null;
    return this.employeeRepo.findOne({ where: { id: managerId } });
  }
}
