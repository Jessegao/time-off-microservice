import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ApproveRequestDto {
  @ApiPropertyOptional({ description: 'Approver UUID' })
  @IsUUID()
  approverId: string;

  @ApiPropertyOptional({ description: 'Optional comments' })
  @IsOptional()
  @IsString()
  comments?: string;
}

export class RejectRequestDto {
  @ApiPropertyOptional({ description: 'Approver UUID' })
  @IsUUID()
  approverId: string;

  @ApiPropertyOptional({ description: 'Rejection reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}
