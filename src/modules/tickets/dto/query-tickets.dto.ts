import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { TicketType, TicketStatus } from '../../../../generated/prisma/client';

export class QueryTicketsDto {
  @ApiPropertyOptional({ enum: TicketType, description: 'Lọc theo loại vé' })
  @IsEnum(TicketType)
  @IsOptional()
  ticketType?: TicketType;

  @ApiPropertyOptional({ enum: TicketStatus, description: 'Lọc theo trạng thái vé' })
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

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
