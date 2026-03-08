import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { BusStatus } from '../../../../generated/prisma/client';
  
export class CreateBusDto {
  @ApiProperty({ example: '29B-123.45', description: 'Biển số xe' })
  @IsString()
  @IsNotEmpty()
  licensePlate: string;

  @ApiProperty({ example: 45, description: 'Số lượng chỗ ngồi' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  seatCapacity: number;

  @ApiPropertyOptional({ enum: BusStatus, default: BusStatus.ACTIVE, description: 'Trạng thái hoạt động của xe' })
  @IsOptional()
  @IsEnum(BusStatus)
  status?: BusStatus;

  @ApiPropertyOptional({ default: true, description: 'Cờ đánh dấu xe cón sử dụng' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
