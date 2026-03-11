import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { DiscountType } from '../../../../generated/prisma/client';

export class CreatePromotionDto {
  @ApiProperty({ example: 'SUMMER2026', description: 'Mã khuyến mãi' })
  @IsString()
  @IsNotEmpty({ message: 'Mã khuyến mãi không được để trống' })
  code: string;

  @ApiProperty({ enum: DiscountType, description: 'Loại giảm giá (PERCENTAGE hoặc FIXED)' })
  @IsEnum(DiscountType, { message: 'Loại giảm giá không hợp lệ' })
  discountType: DiscountType;

  @ApiProperty({ example: 10, description: 'Giá trị giảm (% hoặc số tiền cố định)' })
  @IsNumber({}, { message: 'Giá trị giảm phải là số' })
  @Min(0, { message: 'Giá trị giảm không được âm' })
  @Type(() => Number)
  discountValue: number;

  @ApiPropertyOptional({ example: 100, description: 'Giới hạn số lần sử dụng' })
  @IsOptional()
  @IsInt({ message: 'Giới hạn sử dụng phải là số nguyên' })
  @Min(1, { message: 'Giới hạn sử dụng tối thiểu là 1' })
  @Type(() => Number)
  usageLimit?: number;

  @ApiProperty({ example: '2026-03-01T00:00:00Z', description: 'Ngày bắt đầu hiệu lực' })
  @IsNotEmpty({ message: 'Ngày bắt đầu không được để trống' })
  validFrom: string;

  @ApiProperty({ example: '2026-06-30T23:59:59Z', description: 'Ngày hết hạn' })
  @IsNotEmpty({ message: 'Ngày hết hạn không được để trống' })
  validUntil: string;
}
