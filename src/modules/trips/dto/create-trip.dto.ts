import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateTripDto {
  @ApiProperty({ description: 'ID tuyến đường', example: 'uuid-of-route' })
  @IsUUID()
  @IsNotEmpty()
  routeId: string;

  @ApiPropertyOptional({ description: 'ID xe buýt', example: 'uuid-of-bus' })
  @IsUUID()
  @IsOptional()
  busId?: string;

  @ApiPropertyOptional({ description: 'ID tài xế', example: 'uuid-of-driver' })
  @IsUUID()
  @IsOptional()
  driverId?: string;

  @ApiProperty({ description: 'Ngày dự kiến chạy (YYYY-MM-DD)', example: '2026-03-10' })
  @IsDateString()
  @IsNotEmpty()
  scheduledDate: string;

  @ApiPropertyOptional({ description: 'Giờ khởi hành dự kiến (ISO 8601)', example: '2026-03-10T07:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  startTime?: string;
}
