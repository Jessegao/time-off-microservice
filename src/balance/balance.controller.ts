import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { BalanceService } from './balance.service';
import { BalanceResponseDto } from './dto/balance.response.dto';
import { DriftReportResponseDto } from './dto/drift-report.dto';

@ApiTags('balances')
@Controller('api/v1')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get('employees/:employeeId/balances')
  @ApiOperation({ summary: 'Get all balances for an employee' })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'List of employee balances' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  async getEmployeeBalances(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<BalanceResponseDto[]> {
    return this.balanceService.getBalancesForEmployee(employeeId);
  }

  @Get('employees/:employeeId/balances/:typeId')
  @ApiOperation({ summary: 'Get specific balance by type' })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiParam({ name: 'typeId', description: 'Time Off Type UUID' })
  @ApiResponse({ status: 200, description: 'Balance details' })
  @ApiResponse({ status: 404, description: 'Balance not found' })
  async getBalanceByType(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('typeId', ParseUUIDPipe) typeId: string,
  ): Promise<BalanceResponseDto> {
    return this.balanceService.getBalanceByType(employeeId, typeId);
  }

  @Get('balances/drift-report')
  @ApiOperation({ summary: 'Get drift report for all balances' })
  @ApiResponse({ status: 200, description: 'Drift report' })
  async getDriftReport(): Promise<DriftReportResponseDto> {
    return this.balanceService.detectDrift();
  }

  @Post('employees/:employeeId/balances/:typeId/reconcile')
  @ApiOperation({ summary: 'Force reconcile a single balance with HCM' })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiParam({ name: 'typeId', description: 'Time Off Type UUID' })
  @ApiResponse({ status: 200, description: 'Reconciled balance' })
  @ApiResponse({ status: 404, description: 'Balance not found' })
  async reconcileBalance(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('typeId', ParseUUIDPipe) typeId: string,
  ): Promise<BalanceResponseDto> {
    const balance = await this.balanceService.reconcileBalance(employeeId, typeId);
    return {
      id: balance.id,
      employeeId: balance.employeeId,
      timeOffTypeId: balance.timeOffTypeId,
      timeOffTypeName: '',
      availableDays: Number(balance.availableDays),
      pendingDays: Number(balance.pendingDays),
      usedDays: Number(balance.usedDays),
      totalDays: Number(balance.totalDays),
      status: balance.status,
      source: balance.source,
      effectiveAvailable: this.balanceService.calculateEffectiveAvailable(balance),
      hcmLastSyncedAt: balance.hcmLastSyncedAt,
    };
  }
}
