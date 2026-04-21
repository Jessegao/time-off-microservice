import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Balance, BalanceStatus, BalanceSource } from './entities/balance.entity';
import { Employee } from '../employee/entities/employee.entity';
import { TimeOffType } from '../time-off-type/entities/time-off-type.entity';
import { HcmSyncLog, SyncType, SyncDirection, SyncStatus } from '../sync-log/entities/hcm-sync-log.entity';
import { BalanceResponseDto } from './dto/balance.response.dto';
import { DriftReportItemDto, DriftReportResponseDto } from './dto/drift-report.dto';
import { ConfigService } from '@nestjs/config';
import { HcmClientService } from '../hcm/hcm-client/hcm-client.service';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepo: Repository<Balance>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(TimeOffType)
    private readonly timeOffTypeRepo: Repository<TimeOffType>,
    @InjectRepository(HcmSyncLog)
    private readonly syncLogRepo: Repository<HcmSyncLog>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly hcmClient: HcmClientService,
  ) {}

  calculateEffectiveAvailable(balance: Balance): number {
    const available = Number(balance.availableDays);
    const pending = Number(balance.pendingDays);
    return available - pending;
  }

  async getBalancesForEmployee(employeeId: string): Promise<BalanceResponseDto[]> {
    const employee = await this.employeeRepo.findOne({ where: { id: employeeId } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID ${employeeId} not found`);
    }

    const balances = await this.balanceRepo.find({
      where: { employeeId },
      relations: ['timeOffType'],
    });

    return balances.map((balance) => this.toResponseDto(balance));
  }

  async getBalanceByType(employeeId: string, typeId: string): Promise<BalanceResponseDto> {
    const balance = await this.balanceRepo.findOne({
      where: { employeeId, timeOffTypeId: typeId },
      relations: ['timeOffType'],
    });

    if (!balance) {
      throw new NotFoundException(
        `Balance not found for employee ${employeeId} and type ${typeId}`,
      );
    }

    return this.toResponseDto(balance);
  }

  async validateBalanceForRequest(
    employeeId: string,
    typeId: string,
    requestedDays: number,
  ): Promise<void> {
    const balance = await this.balanceRepo.findOne({
      where: { employeeId, timeOffTypeId: typeId },
    });

    if (!balance) {
      throw new NotFoundException(
        `Balance not found for employee ${employeeId} and type ${typeId}`,
      );
    }

    const effectiveAvailable = this.calculateEffectiveAvailable(balance);
    if (effectiveAvailable < requestedDays) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient balance. Requested: ${requestedDays}, Available: ${effectiveAvailable}`,
        requested: requestedDays,
        available: effectiveAvailable,
      });
    }
  }

  async applyHcmUpdate(
    balanceId: string,
    hcmAvailable: number,
    hcmTotal: number,
    occurredAt: Date,
  ): Promise<Balance> {
    const balance = await this.balanceRepo.findOne({ where: { id: balanceId } });
    if (!balance) {
      throw new NotFoundException(`Balance with ID ${balanceId} not found`);
    }

    const previousAvailable = Number(balance.availableDays);
    balance.availableDays = hcmAvailable;
    balance.totalDays = hcmTotal;
    balance.hcmLastSyncedAt = occurredAt;
    balance.status = BalanceStatus.SYNCED;
    balance.source = BalanceSource.HCM;

    const diff = Math.abs(previousAvailable - hcmAvailable);
    const threshold = this.configService.get<number>('sync.driftThreshold') || 0.5;
    const criticalThreshold = this.configService.get<number>('sync.criticalDriftThreshold') || 2;

    if (diff > criticalThreshold) {
      balance.status = BalanceStatus.CONFLICT;
    } else if (diff > threshold) {
      balance.status = BalanceStatus.DRIFTED;
    }

    return this.balanceRepo.save(balance);
  }

  async incrementPendingDays(
    balanceId: string,
    days: number,
  ): Promise<void> {
    await this.balanceRepo.increment({ id: balanceId }, 'pendingDays', days);
  }

  async decrementPendingDays(
    employeeId: string,
    timeOffTypeId: string,
    days: number,
  ): Promise<void> {
    const balance = await this.balanceRepo.findOne({
      where: { employeeId, timeOffTypeId },
    });
    if (balance) {
      const newPending = Math.max(0, Number(balance.pendingDays) - days);
      await this.balanceRepo.update(balance.id, { pendingDays: newPending });
    }
  }

  async moveToUsedDays(balanceId: string, days: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(Balance, { where: { id: balanceId } });
      if (balance) {
        const newPending = Math.max(0, Number(balance.pendingDays) - days);
        const newUsed = Number(balance.usedDays) + days;
        const newAvailable = Number(balance.availableDays) - days;

        await manager.update(Balance, balanceId, {
          pendingDays: newPending,
          usedDays: newUsed,
          availableDays: newAvailable,
        });
      }
    });
  }

  async detectDrift(): Promise<DriftReportResponseDto> {
    const driftThreshold = this.configService.get<number>('sync.driftThreshold') || 0.5;
    const criticalThreshold = this.configService.get<number>('sync.criticalDriftThreshold') || 2;

    const balances = await this.balanceRepo.find({
      where: { status: BalanceStatus.SYNCED },
      relations: ['employee', 'timeOffType'],
    });

    const items: DriftReportItemDto[] = [];
    let criticalCount = 0;

    for (const balance of balances) {
      try {
        const hcmBalance = await this.hcmClient.getBalance(
          balance.employee.hcmEmployeeId,
          balance.timeOffType.hcmTypeId,
        );

        const diff = Math.abs(Number(balance.availableDays) - hcmBalance.availableDays);

        if (diff > driftThreshold) {
          const status = diff > criticalThreshold ? BalanceStatus.CONFLICT : BalanceStatus.DRIFTED;
          await this.balanceRepo.update(balance.id, { status });

          items.push({
            balanceId: balance.id,
            employeeId: balance.employeeId,
            timeOffTypeId: balance.timeOffTypeId,
            localAvailableDays: Number(balance.availableDays),
            hcmAvailableDays: hcmBalance.availableDays,
            difference: diff,
            status,
            lastSyncedAt: balance.hcmLastSyncedAt,
          });

          if (diff > criticalThreshold) {
            criticalCount++;
          }
        }
      } catch (error) {
        this.logger.error(`Failed to check drift for balance ${balance.id}: ${error}`);
      }
    }

    return {
      items,
      totalChecked: balances.length,
      driftCount: items.length,
      criticalCount,
    };
  }

  async reconcileBalance(
    employeeId: string,
    typeId: string,
  ): Promise<Balance> {
    const balance = await this.balanceRepo.findOne({
      where: { employeeId, timeOffTypeId: typeId },
      relations: ['employee', 'timeOffType'],
    });

    if (!balance) {
      throw new NotFoundException(
        `Balance not found for employee ${employeeId} and type ${typeId}`,
      );
    }

    const hcmBalance = await this.hcmClient.getBalance(
      balance.employee.hcmEmployeeId,
      balance.timeOffType.hcmTypeId,
    );

    return this.applyHcmUpdate(
      balance.id,
      hcmBalance.availableDays,
      hcmBalance.totalDays,
      new Date(),
    );
  }

  private toResponseDto(balance: Balance): BalanceResponseDto {
    return {
      id: balance.id,
      employeeId: balance.employeeId,
      timeOffTypeId: balance.timeOffTypeId,
      timeOffTypeName: balance.timeOffType?.name || '',
      availableDays: Number(balance.availableDays),
      pendingDays: Number(balance.pendingDays),
      usedDays: Number(balance.usedDays),
      totalDays: Number(balance.totalDays),
      status: balance.status,
      source: balance.source,
      effectiveAvailable: this.calculateEffectiveAvailable(balance),
      hcmLastSyncedAt: balance.hcmLastSyncedAt,
    };
  }
}
