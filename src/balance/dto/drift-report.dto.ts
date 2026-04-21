import { ApiProperty } from '@nestjs/swagger';

export class DriftReportItemDto {
  @ApiProperty()
  balanceId: string;

  @ApiProperty()
  employeeId: string;

  @ApiProperty()
  timeOffTypeId: string;

  @ApiProperty()
  localAvailableDays: number;

  @ApiProperty()
  hcmAvailableDays: number;

  @ApiProperty()
  difference: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  lastSyncedAt: Date | null;
}

export class DriftReportResponseDto {
  @ApiProperty({ type: [DriftReportItemDto] })
  items: DriftReportItemDto[];

  @ApiProperty()
  totalChecked: number;

  @ApiProperty()
  driftCount: number;

  @ApiProperty()
  criticalCount: number;
}
