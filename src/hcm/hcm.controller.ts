import {
  Controller,
  Post,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { SyncService } from './sync/sync.service';
import { HcmClientService } from './hcm-client/hcm-client.service';

@ApiTags('hcm')
@Controller('api/v1/hcm')
export class HcmController {
  constructor(
    private readonly syncService: SyncService,
    private readonly hcmClient: HcmClientService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Check HCM connectivity' })
  @ApiResponse({ status: 200, description: 'Health status' })
  async healthCheck(): Promise<{ healthy: boolean }> {
    const healthy = await this.hcmClient.healthCheck();
    return { healthy };
  }

  @Post('sync/employee/:employeeId')
  @ApiOperation({ summary: 'Sync single employee with HCM' })
  @ApiParam({ name: 'employeeId', description: 'Employee UUID' })
  @ApiResponse({ status: 200, description: 'Sync result' })
  async syncEmployee(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ): Promise<{ status: string; message: string }> {
    return this.syncService.syncEmployee(employeeId);
  }

  @Post('sync/batch')
  @ApiOperation({ summary: 'Trigger batch reconciliation' })
  @ApiResponse({ status: 200, description: 'Batch sync result' })
  async batchSync(): Promise<{ status: string; processed: number; failed: number }> {
    return this.syncService.batchSync();
  }

  @Get('sync/logs')
  @ApiOperation({ summary: 'Get recent sync logs' })
  @ApiResponse({ status: 200, description: 'List of sync logs' })
  async getSyncLogs(): Promise<any[]> {
    return this.syncService.getSyncLogs();
  }
}
