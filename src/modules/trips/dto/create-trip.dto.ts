import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { Direction } from '../../../../generated/prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateTripDto {
  @ApiProperty({ description: 'ID tuyến đường', example: 'uuid-of-route' })
  @IsString()
  @Matches(UUID_REGEX, { message: 'ID phải có định dạng UUID hợp lệ' })
  @IsNotEmpty()
  routeId: string;

  @ApiProperty({ enum: Direction, example: Direction.PICK_UP, description: 'Hướng di chuyển (Đón/Trả)' })
  @IsEnum(Direction)
  @IsNotEmpty()
  direction: Direction;

  @ApiPropertyOptional({ description: 'ID xe buýt', example: 'uuid-of-bus' })
  @IsString()
  @Matches(UUID_REGEX, { message: 'ID phải có định dạng UUID hợp lệ' })
  @IsOptional()
  busId?: string;

  @ApiPropertyOptional({ description: 'ID tài xế', example: 'uuid-of-driver' })
  @IsString()
  @Matches(UUID_REGEX, { message: 'ID phải có định dạng UUID hợp lệ' })
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
