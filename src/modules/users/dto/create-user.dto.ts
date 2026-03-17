import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../../generated/prisma/enums';

export class CreateUserDto {
  @ApiProperty({ description: 'Họ và tên của người dùng' })
  @IsString()
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  fullName: string;

  @ApiProperty({ description: 'Địa chỉ email' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @ApiProperty({ description: 'Mật khẩu' })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password: string;

  @ApiPropertyOptional({ description: 'Số điện thoại' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ enum: Role, description: 'Vai trò của người dùng' })
  @IsEnum(Role, { message: 'Vai trò không hợp lệ' })
  @IsNotEmpty({ message: 'Vai trò không được để trống' })
  role: Role;
}
