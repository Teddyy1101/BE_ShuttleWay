import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { LeaveStatus } from '../../../../generated/prisma/client';

export class UpdateLeaveStatusDto {
  @ApiProperty({
    enum: [LeaveStatus.APPROVED, LeaveStatus.REJECTED],
    description: 'Trạng thái mới (APPROVED hoặc REJECTED)',
  })
  @IsEnum(LeaveStatus, { message: 'Trạng thái không hợp lệ. Chọn APPROVED hoặc REJECTED' })
  status: LeaveStatus;
}
