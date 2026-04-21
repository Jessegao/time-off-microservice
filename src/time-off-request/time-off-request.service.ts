import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { TimeOffRequest, RequestStatus } from './entities/time-off-request.entity';
import { Balance } from '../balance/entities/balance.entity';
import { Employee } from '../employee/entities/employee.entity';
import { TimeOffType } from '../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog, SyncType, SyncDirection, SyncStatus } from '../sync-log/entities/hcm-sync-log.entity';
import { ConflictTicket, ConflictType } from '../conflict/entities/conflict-ticket.entity';
import { BalanceService } from '../balance/balance.service';
import { HcmClientService } from '../hcm/hcm-client/hcm-client.service';
import { CreateTimeOffRequestDto } from './dto/create-request.dto';
import { TimeOffRequestResponseDto } from './dto/request-response.dto';
import { ListRequestsFilterDto } from './dto/list-requests-filter.dto';

@Injectable()
export class TimeOffRequestService {
  private readonly logger = new Logger(TimeOffRequestService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    @InjectRepository(Balance)
    private readonly balanceRepo: Repository<Balance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(TimeOffType)
    private readonly timeOffTypeRepo: Repository<TimeOffType>,
    @InjectRepository(HcmSyncLog)
    private readonly syncLogRepo: Repository<HcmSyncLog>,
    @InjectRepository(ConflictTicket)
    private readonly conflictRepo: Repository<ConflictTicket>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => BalanceService))
    private readonly balanceService: BalanceService,
    private readonly hcmClient: HcmClientService,
  ) {}

  async createRequest(dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    const employee = await this.employeeRepo.findOne({ where: { id: dto.employeeId } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${dto.employeeId} not found`);
    }

    const timeOffType = await this.timeOffTypeRepo.findOne({ where: { id: dto.timeOffTypeId } });
    if (!timeOffType) {
      throw new NotFoundException(`TimeOffType with ID ${dto.timeOffTypeId} not found`);
    }

    const request = this.requestRepo.create({
      employeeId: dto.employeeId,
      timeOffTypeId: dto.timeOffTypeId,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      totalDays: dto.totalDays,
      status: RequestStatus.PENDING,
      requestedAt: new Date(),
    });

    return this.requestRepo.save(request);
  }

  async submitRequest(dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    return this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(Balance, {
        where: { employeeId: dto.employeeId, timeOffTypeId: dto.timeOffTypeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) {
        throw new NotFoundException(
          `Balance not found for employee ${dto.employeeId} and type ${dto.timeOffTypeId}`,
        );
      }

      const effectiveAvailable = this.balanceService.calculateEffectiveAvailable(balance);
      if (effectiveAvailable < dto.totalDays) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_BALANCE',
          message: `Insufficient balance. Requested: ${dto.totalDays}, Available: ${effectiveAvailable}`,
          requested: dto.totalDays,
          available: effectiveAvailable,
        });
      }

      await manager.increment(Balance, { id: balance.id }, 'pendingDays', dto.totalDays);

      const request = manager.create(TimeOffRequest, {
        employeeId: dto.employeeId,
        timeOffTypeId: dto.timeOffTypeId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        totalDays: dto.totalDays,
        status: RequestStatus.PENDING,
        requestedAt: new Date(),
      });

      return manager.save(request);
    });
  }

  async getRequestById(id: string): Promise<TimeOffRequestResponseDto> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: ['employee', 'timeOffType'],
    });

    if (!request) {
      throw new NotFoundException(`TimeOffRequest with ID ${id} not found`);
    }

    return this.toResponseDto(request);
  }

  async listRequests(filter: ListRequestsFilterDto): Promise<TimeOffRequestResponseDto[]> {
    const queryBuilder = this.requestRepo
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('request.timeOffType', 'timeOffType');

    if (filter.employeeId) {
      queryBuilder.andWhere('request.employeeId = :employeeId', { employeeId: filter.employeeId });
    }

    if (filter.status) {
      queryBuilder.andWhere('request.status = :status', { status: filter.status });
    }

    if (filter.startDateFrom) {
      queryBuilder.andWhere('request.startDate >= :startDateFrom', {
        startDateFrom: filter.startDateFrom,
      });
    }

    if (filter.startDateTo) {
      queryBuilder.andWhere('request.startDate <= :startDateTo', {
        startDateTo: filter.startDateTo,
      });
    }

    queryBuilder.orderBy('request.requestedAt', 'DESC');

    const requests = await queryBuilder.getMany();
    return requests.map((r) => this.toResponseDto(r));
  }

  async cancelRequest(id: string): Promise<TimeOffRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });

    if (!request) {
      throw new NotFoundException(`TimeOffRequest with ID ${id} not found`);
    }

    const cancellableStatuses = [RequestStatus.DRAFT, RequestStatus.PENDING];
    if (!cancellableStatuses.includes(request.status)) {
      throw new BadRequestException(
        `Cannot cancel request in status ${request.status}. Only ${cancellableStatuses.join(', ')} can be cancelled.`,
      );
    }

    await this.balanceService.decrementPendingDays(
      request.employeeId,
      request.timeOffTypeId,
      Number(request.totalDays),
    );

    request.status = RequestStatus.CANCELLED;
    return this.requestRepo.save(request);
  }

  async postToHcm(requestId: string): Promise<TimeOffRequest> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['employee', 'timeOffType'],
    });

    if (!request) {
      throw new NotFoundException(`TimeOffRequest with ID ${requestId} not found`);
    }

    await this.requestRepo.update(requestId, { status: RequestStatus.HCM_POSTING });

    const syncLog = this.syncLogRepo.create({
      syncType: SyncType.REQUEST_POST,
      direction: SyncDirection.OUTBOUND,
      hcmEventId: requestId,
      payload: {
        employeeId: request.employee.hcmEmployeeId,
        typeId: request.timeOffType.hcmTypeId,
        startDate: request.startDate,
        endDate: request.endDate,
        totalDays: request.totalDays,
        localRequestId: request.id,
      },
      status: SyncStatus.PENDING,
    });
    await this.syncLogRepo.save(syncLog);

    try {
      const hcmResponse = await this.hcmClient.postTimeOffRequest({
        employeeId: request.employee.hcmEmployeeId,
        typeId: request.timeOffType.hcmTypeId,
        startDate: request.startDate.toISOString().split('T')[0],
        endDate: request.endDate.toISOString().split('T')[0],
        totalDays: Number(request.totalDays),
        localRequestId: request.id,
      });

      if (hcmResponse.status === 'CONFIRMED') {
        request.hcmRequestId = hcmResponse.hcmRequestId;
        request.status = RequestStatus.HCM_POSTED;
        request.hcmPostedAt = new Date();
        await this.requestRepo.save(request);

        await this.syncLogRepo.update(syncLog.id, { status: SyncStatus.SUCCESS, processedAt: new Date() });

        return request;
      }

      if (hcmResponse.status === 'REJECTED') {
        request.status = RequestStatus.HCM_POST_FAILED;

        const conflict = this.conflictRepo.create({
          type: ConflictType.HCM_POST_FAILURE,
          requestId: request.id,
          localBalance: 0,
          hcmBalance: hcmResponse.hcmBalance || 0,
          difference: Math.abs((hcmResponse.hcmBalance || 0)),
        });
        await this.conflictRepo.save(conflict);

        await this.syncLogRepo.update(syncLog.id, {
          status: SyncStatus.FAILED,
          errorMessage: hcmResponse.errorMessage,
          processedAt: new Date(),
        });

        return this.requestRepo.save(request);
      }

      throw new Error(`Unknown HCM response status: ${hcmResponse.status}`);
    } catch (error) {
      request.status = RequestStatus.HCM_POST_FAILED;
      await this.requestRepo.save(request);

      await this.syncLogRepo.update(syncLog.id, {
        status: SyncStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  async completeRequest(id: string): Promise<TimeOffRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });

    if (!request) {
      throw new NotFoundException(`TimeOffRequest with ID ${id} not found`);
    }

    if (request.status !== RequestStatus.HCM_POSTED) {
      throw new BadRequestException(`Cannot complete request in status ${request.status}`);
    }

    await this.balanceService.moveToUsedDays(request.employeeId, Number(request.totalDays));

    request.status = RequestStatus.COMPLETED;
    request.completedAt = new Date();

    return this.requestRepo.save(request);
  }

  private toResponseDto(request: TimeOffRequest): TimeOffRequestResponseDto {
    return {
      id: request.id,
      employeeId: request.employeeId,
      timeOffTypeId: request.timeOffTypeId,
      timeOffTypeName: (request as any).timeOffType?.name || '',
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays: Number(request.totalDays),
      status: request.status,
      hcmRequestId: request.hcmRequestId,
      rejectionReason: request.rejectionReason,
      requestedAt: request.requestedAt,
      approvedAt: request.approvedAt,
      hcmPostedAt: request.hcmPostedAt,
      completedAt: request.completedAt,
    };
  }
}
