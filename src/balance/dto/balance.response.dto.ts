import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BalanceStatus, BalanceSource } from '../entities/balance.entity';

export class BalanceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  employeeId: string;

  @ApiProperty()
  timeOffTypeId: string;

  @ApiProperty()
  timeOffTypeName: string;

  @ApiProperty()
  availableDays: number;

  @ApiProperty()
  pendingDays: number;

  @ApiProperty()
  usedDays: number;

  @ApiProperty()
  totalDays: number;

  @ApiPropertyOptional({ enum: BalanceStatus })
  status?: BalanceStatus;

  @ApiPropertyOptional({ enum: BalanceSource })
  source?: BalanceSource;

  @ApiProperty()
  effectiveAvailable: number;

  @ApiProperty()
  hcmLastSyncedAt: Date | null;
}
