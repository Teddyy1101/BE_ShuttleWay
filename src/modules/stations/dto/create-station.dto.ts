import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateStationDto {
  @ApiProperty({ example: 'Trạm A', description: 'Tên trạm dừng (phải là duy nhất)' })
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

  @ApiPropertyOptional({ default: true, description: 'Cờ đánh dấu trạm còn hoạt động' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
