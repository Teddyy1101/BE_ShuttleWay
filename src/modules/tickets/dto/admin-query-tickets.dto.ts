import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { TicketStatus, TicketType } from '../../../../generated/prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AdminQueryTicketsDto {
  @ApiPropertyOptional({ enum: TicketStatus, description: 'Lọc theo trạng thái vé' })
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketType, description: 'Lọc theo loại vé (MONTHLY / SINGLE_TRIP)' })
  @IsEnum(TicketType)
  @IsOptional()
  ticketType?: TicketType;

  @ApiPropertyOptional({ description: 'Lọc theo ID tuyến đường' })
  @IsString()
  @Matches(UUID_REGEX, { message: 'ID phải có định dạng UUID hợp lệ' })
  @IsOptional()
  routeId?: string;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo mã vé hoặc tên học sinh' })
  @IsString()
  @IsOptional()
  search?: string;

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
