import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { TransactionStatus } from '../../../../generated/prisma/client';

export class UpdateTransactionStatusDto {
  @ApiProperty({
    enum: [TransactionStatus.SUCCESS, TransactionStatus.FAILED],
    description: 'Trạng thái thanh toán mới (SUCCESS hoặc FAILED)',
  })
  @IsEnum(TransactionStatus, { message: 'Trạng thái thanh toán không hợp lệ' })
  @IsNotEmpty({ message: 'Trạng thái thanh toán không được để trống' })
  status: TransactionStatus;
}
