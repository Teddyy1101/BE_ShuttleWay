import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SupportTicketStatus } from '../../../../generated/prisma/client';

export class UpdateTicketStatusDto {
  @ApiProperty({
    enum: SupportTicketStatus,
    description: 'Trạng thái mới của phiếu hỗ trợ',
  })
  @IsEnum(SupportTicketStatus, { message: 'Trạng thái không hợp lệ. Chọn OPEN, IN_PROGRESS hoặc CLOSED' })
  status: SupportTicketStatus;
}
