import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  IsEmail,
} from 'class-validator';
import { TicketCategory } from '../../../../generated/prisma/client';

export class CreateSupportTicketDto {
  // === Thông tin User (nếu gửi từ App) ===

  @ApiPropertyOptional({ description: 'ID người dùng (nếu gửi từ App)', example: 'uuid-user' })
  @IsUUID('4', { message: 'ID người dùng không hợp lệ' })
  @IsOptional()
  userId?: string;

  // === Thông tin khách vãng lai (nếu gửi từ Landing Page) ===

  @ApiPropertyOptional({ description: 'Tên khách vãng lai (bắt buộc nếu không có userId)' })
  @ValidateIf((o) => !o.userId)
  @IsNotEmpty({ message: 'Tên khách hàng không được để trống khi không có tài khoản' })
  @IsString({ message: 'Tên khách hàng phải là chuỗi ký tự' })
  guestName?: string;

  @ApiPropertyOptional({ description: 'SĐT khách vãng lai (bắt buộc nếu không có userId)' })
  @ValidateIf((o) => !o.userId)
  @IsNotEmpty({ message: 'Số điện thoại không được để trống khi không có tài khoản' })
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự' })
  guestPhone?: string;

  @ApiPropertyOptional({ description: 'Email khách vãng lai' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsOptional()
  guestEmail?: string;

  // === Nội dung phiếu hỗ trợ ===

  @ApiProperty({ enum: TicketCategory, description: 'Danh mục yêu cầu hỗ trợ' })
  @IsEnum(TicketCategory, { message: 'Danh mục không hợp lệ' })
  @IsNotEmpty({ message: 'Danh mục không được để trống' })
  category: TicketCategory;

  @ApiProperty({ description: 'Tiêu đề yêu cầu hỗ trợ', example: 'Quên đồ trên xe' })
  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  title: string;

  @ApiProperty({ description: 'Nội dung chi tiết yêu cầu hỗ trợ' })
  @IsString({ message: 'Nội dung phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  content: string;
}
