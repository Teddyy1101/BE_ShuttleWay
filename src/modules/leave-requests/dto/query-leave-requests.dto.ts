import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { LeaveStatus } from '../../../../generated/prisma/client';

export class QueryLeaveRequestsDto {
  @ApiPropertyOptional({ enum: LeaveStatus, description: 'Lọc theo trạng thái đơn' })
  @IsEnum(LeaveStatus)
  @IsOptional()
  status?: LeaveStatus;

  @ApiPropertyOptional({ description: 'Lọc theo ID học sinh' })
  @IsUUID('4', { message: 'ID học sinh không hợp lệ' })
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên học sinh' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc từ ngày (ISO date string)' })
  @IsString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Lọc đến ngày (ISO date string)' })
  @IsString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ example: 1, description: 'Số trang', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, description: 'Số lượng mỗi trang', default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 10;
}
