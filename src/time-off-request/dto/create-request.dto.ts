import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateTimeOffRequestDto {
  @ApiProperty({ description: 'Employee UUID' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ description: 'Time Off Type UUID' })
  @IsUUID()
  timeOffTypeId: string;

  @ApiProperty({ description: 'Start date (YYYY-MM-DD)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date (YYYY-MM-DD)' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ description: 'Total days requested' })
  @IsNumber()
  @Min(0.5)
  totalDays: number;

  @ApiProperty({ description: 'Optional notes' })
  @IsOptional()
  notes?: string;
}
