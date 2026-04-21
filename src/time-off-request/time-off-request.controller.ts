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
} from '@nestjs/swagger';
import { TimeOffRequestService } from './time-off-request.service';
import { CreateTimeOffRequestDto } from './dto/create-request.dto';
import { TimeOffRequestResponseDto } from './dto/request-response.dto';
import { ListRequestsFilterDto } from './dto/list-requests-filter.dto';

@ApiTags('time-off-requests')
@Controller('api/v1/time-off-requests')
export class TimeOffRequestController {
  constructor(private readonly requestService: TimeOffRequestService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new time off request' })
  @ApiResponse({ status: 201, description: 'Request created' })
  @ApiResponse({ status: 400, description: 'Invalid input or insufficient balance' })
  async createRequest(@Body() dto: CreateTimeOffRequestDto): Promise<TimeOffRequestResponseDto> {
    const request = await this.requestService.submitRequest(dto);
    return this.requestService.getRequestById(request.id);
  }

  @Get()
  @ApiOperation({ summary: 'List time off requests with filters' })
  @ApiResponse({ status: 200, description: 'List of requests' })
  async listRequests(@Query() filter: ListRequestsFilterDto): Promise<TimeOffRequestResponseDto[]> {
    return this.requestService.listRequests(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single request by ID' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request details' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async getRequest(@Param('id', ParseUUIDPipe) id: string): Promise<TimeOffRequestResponseDto> {
    return this.requestService.getRequestById(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending request' })
  @ApiParam({ name: 'id', description: 'Request UUID' })
  @ApiResponse({ status: 200, description: 'Request cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel request in current status' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  async cancelRequest(@Param('id', ParseUUIDPipe) id: string): Promise<TimeOffRequestResponseDto> {
    await this.requestService.cancelRequest(id);
    return this.requestService.getRequestById(id);
  }
}
