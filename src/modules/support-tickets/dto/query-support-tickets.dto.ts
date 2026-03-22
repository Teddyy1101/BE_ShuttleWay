import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import {
  SupportTicketStatus,
  TicketCategory,
} from '../../../../generated/prisma/client';

export class QuerySupportTicketsDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus, description: 'Lọc theo trạng thái phiếu' })
  @IsEnum(SupportTicketStatus, { message: 'Trạng thái không hợp lệ' })
  @IsOptional()
  status?: SupportTicketStatus;

  @ApiPropertyOptional({ enum: TicketCategory, description: 'Lọc theo danh mục' })
  @IsEnum(TicketCategory, { message: 'Danh mục không hợp lệ' })
  @IsOptional()
  category?: TicketCategory;

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
