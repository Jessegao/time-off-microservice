import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeOffType } from './entities/time-off-type.entity';

@Injectable()
export class TimeOffTypeService {
  constructor(
    @InjectRepository(TimeOffType)
    private readonly timeOffTypeRepo: Repository<TimeOffType>,
  ) {}

  async findById(id: string): Promise<TimeOffType> {
    const type = await this.timeOffTypeRepo.findOne({ where: { id } });
    if (!type) {
      throw new NotFoundException(`TimeOffType with ID ${id} not found`);
    }
    return type;
  }

  async findByHcmId(hcmTypeId: string): Promise<TimeOffType> {
    const type = await this.timeOffTypeRepo.findOne({ where: { hcmTypeId } });
    if (!type) {
      throw new NotFoundException(`TimeOffType with HCM ID ${hcmTypeId} not found`);
    }
    return type;
  }

  async findAll(): Promise<TimeOffType[]> {
    return this.timeOffTypeRepo.find();
  }

  async findTypesRequiringApproval(): Promise<TimeOffType[]> {
    return this.timeOffTypeRepo.find({ where: { requiresApproval: true } });
  }
}
