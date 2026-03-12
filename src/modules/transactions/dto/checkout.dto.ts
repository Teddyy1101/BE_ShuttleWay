import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PaymentMethod } from '../../../../generated/prisma/client';

export class CheckoutDto {
  @ApiProperty({ description: 'ID vé cần thanh toán', example: 'uuid-ticket' })
  @IsString()
  @IsNotEmpty({ message: 'ID vé không được để trống' })
  ticketId: string;

  @ApiProperty({
    enum: PaymentMethod,
    description: 'Phương thức thanh toán (VNPAY, MOMO, SEPAY, CASH)',
  })
  @IsEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' })
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Mã khuyến mãi (không bắt buộc)',
    example: 'SUMMER2026',
  })
  @IsString()
  @IsOptional()
  promotionCode?: string;
}
