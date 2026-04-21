import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ApprovalService } from './approval.service';
import { ApproveRequestDto, RejectRequestDto } from './dto/approval-request.dto';
import { Approval } from './entities/approval.entity';

@ApiTags('approvals')
@Controller('api/v1')
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Get('approvals/pending')
  @ApiOperation({ summary: 'Get pending approvals for manager' })
  @ApiQuery({ name: 'managerId', description: 'Manager UUID' })
  @ApiResponse({ status: 200, description: 'List of pending approvals' })
  async getPendingApprovals(
    @Query('managerId', ParseUUIDPipe) managerId: string,
  ): Promise<Approval[]> {
    return this.approvalService.getPendingApprovalsForManager(managerId);
  }

  @Post('approvals/:requestId/approve')
  @ApiOperation({ summary: 'Approve a time off request' })
  @ApiParam({ name: 'requestId', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request approved' })
  @ApiResponse({ status: 400, description: 'Cannot approve in current status' })
  @ApiResponse({ status: 403, description: 'Not authorized to approve' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async approveRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ApproveRequestDto,
  ): Promise<Approval> {
    return this.approvalService.approveRequest(requestId, dto.approverId || '', dto);
  }

  @Post('approvals/:requestId/reject')
  @ApiOperation({ summary: 'Reject a time off request' })
  @ApiParam({ name: 'requestId', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request rejected' })
  @ApiResponse({ status: 400, description: 'Cannot reject in current status' })
  @ApiResponse({ status: 403, description: 'Not authorized to reject' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async rejectRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RejectRequestDto,
  ): Promise<Approval> {
    return this.approvalService.rejectRequest(requestId, dto.approverId || '', dto);
  }
}
