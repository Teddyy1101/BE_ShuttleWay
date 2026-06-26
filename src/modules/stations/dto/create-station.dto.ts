import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateStationDto {
  @ApiProperty({ example: 'Trạm A', description: 'Tên trạm dừng (phải là duy nhất)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 21.028511, description: 'Vĩ độ' })
  @IsNumber()
  @Min(-90, { message: 'Vĩ độ phải nằm trong khoảng -90 đến 90' })
  @Max(90, { message: 'Vĩ độ phải nằm trong khoảng -90 đến 90' })
  @Type(() => Number)
  latitude: number;

  @ApiProperty({ example: 105.804817, description: 'Kinh độ' })
  @IsNumber()
  @Min(-180, { message: 'Kinh độ phải nằm trong khoảng -180 đến 180' })
  @Max(180, { message: 'Kinh độ phải nằm trong khoảng -180 đến 180' })
  @Type(() => Number)
  longitude: number;

  @ApiPropertyOptional({ default: true, description: 'Cờ đánh dấu trạm còn hoạt động' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
