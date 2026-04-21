import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn B' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: '0987654321' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'fcm_token_string' })
  @IsString()
  @IsOptional()
  fcmToken?: string;

  @ApiPropertyOptional({ example: 'STUDENT' })
  @IsString()
  @IsOptional()
  role?: string;
}
