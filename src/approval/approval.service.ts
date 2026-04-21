import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Approval, ApprovalStatus } from './entities/approval.entity';
import { TimeOffRequest, RequestStatus } from '../time-off-request/entities/time-off-request.entity';
import { Employee } from '../employee/entities/employee.entity';
import { TimeOffRequestService } from '../time-off-request/time-off-request.service';
import { ApproveRequestDto, RejectRequestDto } from './dto/approval-request.dto';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    @InjectRepository(Approval)
    private readonly approvalRepo: Repository<Approval>,
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    private readonly requestService: TimeOffRequestService,
  ) {}

  async getPendingApprovalsForManager(managerId: string): Promise<Approval[]> {
    const manager = await this.employeeRepo.findOne({ where: { id: managerId } });
    if (!manager) {
      throw new NotFoundException(`Manager with ID ${managerId} not found`);
    }

    const directReports = await this.employeeRepo.find({
      where: { managerId, isActive: true },
    });

    if (directReports.length === 0) {
      return [];
    }

    const directReportIds = directReports.map((e) => e.id);

    return this.approvalRepo
      .createQueryBuilder('approval')
      .leftJoinAndSelect('approval.timeOffRequest', 'request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('request.timeOffType', 'timeOffType')
      .where('request.employeeId IN (:...employeeIds)', { employeeIds: directReportIds })
      .andWhere('approval.status = :status', { status: ApprovalStatus.PENDING })
      .orderBy('request.requestedAt', 'ASC')
      .getMany();
  }

  async approveRequest(
    requestId: string,
    approverId: string,
    dto: ApproveRequestDto,
  ): Promise<Approval> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['employee'],
    });

    if (!request) {
      throw new NotFoundException(`TimeOffRequest with ID ${requestId} not found`);
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Cannot approve request in status ${request.status}`);
    }

    const approver = await this.employeeRepo.findOne({ where: { id: approverId } });
    if (!approver) {
      throw new NotFoundException(`Approver with ID ${approverId} not found`);
    }

    if (request.employee.managerId !== approverId) {
      throw new ForbiddenException('You are not the manager of this employee');
    }

    const existingApproval = await this.approvalRepo.findOne({
      where: { requestId, approverId },
    });

    if (existingApproval) {
      existingApproval.status = ApprovalStatus.APPROVED;
      existingApproval.comments = dto.comments || null;
      existingApproval.decidedAt = new Date();
      await this.approvalRepo.save(existingApproval);
    } else {
      const approval = this.approvalRepo.create({
        requestId,
        approverId,
        status: ApprovalStatus.APPROVED,
        comments: dto.comments || null,
        decidedAt: new Date(),
      });
      await this.approvalRepo.save(approval);
    }

    request.status = RequestStatus.APPROVED;
    request.approvedAt = new Date();
    await this.requestRepo.save(request);

    try {
      await this.requestService.postToHcm(requestId);
    } catch (error) {
      this.logger.error(`HCM post failed for request ${requestId}: ${error}`);
    }

    return this.approvalRepo.findOne({
      where: { requestId, approverId },
      relations: ['timeOffRequest', 'approver'],
    }) as Promise<Approval>;
  }

  async rejectRequest(
    requestId: string,
    approverId: string,
    dto: RejectRequestDto,
  ): Promise<Approval> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['employee'],
    });

    if (!request) {
      throw new NotFoundException(`TimeOffRequest with ID ${requestId} not found`);
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Cannot reject request in status ${request.status}`);
    }

    const approver = await this.employeeRepo.findOne({ where: { id: approverId } });
    if (!approver) {
      throw new NotFoundException(`Approver with ID ${approverId} not found`);
    }

    if (request.employee.managerId !== approverId) {
      throw new ForbiddenException('You are not the manager of this employee');
    }

    const existingApproval = await this.approvalRepo.findOne({
      where: { requestId, approverId },
    });

    if (existingApproval) {
      existingApproval.status = ApprovalStatus.REJECTED;
      existingApproval.comments = dto.reason || null;
      existingApproval.decidedAt = new Date();
      await this.approvalRepo.save(existingApproval);
    } else {
      const approval = this.approvalRepo.create({
        requestId,
        approverId,
        status: ApprovalStatus.REJECTED,
        comments: dto.reason || null,
        decidedAt: new Date(),
      });
      await this.approvalRepo.save(approval);
    }

    request.status = RequestStatus.REJECTED;
    request.rejectionReason = dto.reason || null;
    await this.requestRepo.save(request);

    await this.requestService.cancelRequest(requestId);

    return this.approvalRepo.findOne({
      where: { requestId, approverId },
      relations: ['timeOffRequest', 'approver'],
    }) as Promise<Approval>;
  }
}
