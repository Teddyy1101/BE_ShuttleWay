import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Direction, ShiftType } from '../../../../generated/prisma/client';

export class QueryRoutesDto {
  @ApiPropertyOptional({ enum: ShiftType, description: 'Lọc theo ca tuyến (Sáng/Chiều)' })
  @IsEnum(ShiftType)
  @IsOptional()
  shiftType?: ShiftType;

  @ApiPropertyOptional({ enum: Direction, description: 'Lọc theo hướng di chuyển (Đón/Trả)' })
  @IsEnum(Direction)
  @IsOptional()
  direction?: Direction;

  @ApiPropertyOptional({ description: 'Lọc theo cờ hoạt động (true/false)' })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

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
