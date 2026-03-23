import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ShiftType } from '../../../../generated/prisma/client';
import { RouteStationItemDto } from './route-station-item.dto';

export class CreateRouteDto {
  @ApiProperty({ example: 'Tuyến số 1A', description: 'Tên hiển thị của tuyến đường' })
  @IsString()
  @IsNotEmpty()
  name: string;

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

  // Mảng các trạm dừng kèm thứ tự — sẽ được ghi vào bảng trung gian RouteStation
  @ApiPropertyOptional({
    type: [RouteStationItemDto],
    description: 'Danh sách trạm dừng kèm thứ tự trên tuyến (ghi vào bảng trung gian RouteStation)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteStationItemDto)
  stations?: RouteStationItemDto[];
}
