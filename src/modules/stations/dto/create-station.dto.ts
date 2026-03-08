import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateStationDto {
  @ApiProperty({ example: 'uuid-route-id', description: 'ID của tuyến đường' })
  @IsUUID()
  @IsNotEmpty()
  routeId: string;

  @ApiProperty({ example: 'Trạm A', description: 'Tên trạm dừng' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 21.028511, description: 'Vĩ độ' })
  @IsNumber()
  @Type(() => Number)
  latitude: number;

  @ApiProperty({ example: 105.804817, description: 'Kinh độ' })
  @IsNumber()
  @Type(() => Number)
  longitude: number;

  @ApiProperty({ example: 1, description: 'Thứ tự của trạm dừng trên tuyến' })
  @IsInt()
  @Type(() => Number)
  orderIndex: number;

  @ApiPropertyOptional({ default: true, description: 'Cờ đánh dấu trạm còn hoạt động' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
