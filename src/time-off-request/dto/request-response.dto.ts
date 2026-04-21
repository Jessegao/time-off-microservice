import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '../entities/time-off-request.entity';

export class TimeOffRequestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  employeeId: string;

  @ApiProperty()
  timeOffTypeId: string;

  @ApiProperty()
  timeOffTypeName: string;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  totalDays: number;

  @ApiPropertyOptional({ enum: RequestStatus })
  status?: RequestStatus;

  @ApiPropertyOptional()
  hcmRequestId?: string | null;

  @ApiPropertyOptional()
  rejectionReason?: string | null;

  @ApiProperty()
  requestedAt: Date;

  @ApiPropertyOptional()
  approvedAt?: Date | null;

  @ApiPropertyOptional()
  hcmPostedAt?: Date | null;

  @ApiPropertyOptional()
  completedAt?: Date | null;
}
