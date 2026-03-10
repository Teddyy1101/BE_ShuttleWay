import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { TripStatus } from '../../../../generated/prisma/client';

export class QueryTripsDto {
  @ApiPropertyOptional({ enum: TripStatus, description: 'Lọc theo trạng thái chuyến đi' })
  @IsEnum(TripStatus)
  @IsOptional()
  status?: TripStatus;

  @ApiPropertyOptional({ description: 'Lọc theo ngày dự kiến (YYYY-MM-DD)', example: '2026-03-10' })
  @IsDateString()
  @IsOptional()
  scheduledDate?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID tuyến đường' })
  @IsUUID()
  @IsOptional()
  routeId?: string;

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
