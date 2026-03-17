import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Direction, ShiftType } from '../../../../generated/prisma/client';

export class CreateRouteDto {
  @ApiProperty({ example: 'R01', description: 'Mã tuyến đường (duy nhất)' })
  @IsString()
  @IsNotEmpty()
  routeCode: string;

  @ApiProperty({ example: 'Tuyến số 1A', description: 'Tên hiển thị của tuyến đường' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: Direction, example: Direction.PICK_UP, description: 'Hướng di chuyển (Đón/Trả)' })
  @IsEnum(Direction)
  direction: Direction;

  @ApiProperty({ enum: ShiftType, example: ShiftType.MORNING, description: 'Ca tuyến (Sáng/Chiều)' })
  @IsEnum(ShiftType)
  shiftType: ShiftType;

  @ApiProperty({ example: '2026-03-01T06:30:00Z', description: 'Thời gian dự kiến chuỗi định dạng ISO-8601' })
  @IsString()
  @IsNotEmpty()
  estimatedTime: string;

  @ApiProperty({ example: 10000, description: 'Giá vé lượt' })
  @IsNumber()
  @Type(() => Number)
  singlePrice: number;

  @ApiProperty({ example: 250000, description: 'Giá vé tháng' })
  @IsNumber()
  @Type(() => Number)
  monthlyPrice: number;

  @ApiPropertyOptional({ default: true, description: 'Cờ đánh dấu tuyến đường còn hoạt động' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
