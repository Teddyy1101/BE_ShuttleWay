import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { Role } from '../../../../generated/prisma/client';

export class SocialLoginDto {
  @ApiProperty({ description: 'ID Token từ Firebase Authentication' })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({ description: 'Vai trò khi tạo tài khoản mới (PARENT, STUDENT)', enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: 'Số điện thoại khi tạo tài khoản mới' })
  @IsOptional()
  @IsString()
  phone?: string;
}
