import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, Validate } from 'class-validator';
import { MatchPasswordConstraint } from './change-password.dto';

export class ResetPasswordDto {
  @ApiProperty({ example: 'abc123token', description: 'Token reset mật khẩu' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'newPassword456', description: 'Mật khẩu mới (tối thiểu 6 ký tự)', minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string;

  @ApiProperty({ example: 'newPassword456', description: 'Xác nhận mật khẩu mới' })
  @IsString()
  @Validate(MatchPasswordConstraint)
  confirmPassword: string;
}
