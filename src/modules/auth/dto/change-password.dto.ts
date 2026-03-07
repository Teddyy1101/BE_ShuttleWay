import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'MatchPassword', async: false })
export class MatchPasswordConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: string, args: ValidationArguments) {
    const obj = args.object as any;
    return confirmPassword === obj.newPassword;
  }

  defaultMessage() {
    return 'Mật khẩu xác nhận không khớp với mật khẩu mới';
  }
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'oldPassword123', description: 'Mật khẩu hiện tại' })
  @IsString()
  oldPassword: string;

  @ApiProperty({ example: 'newPassword456', description: 'Mật khẩu mới (tối thiểu 6 ký tự)', minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string;

  @ApiProperty({ example: 'newPassword456', description: 'Xác nhận mật khẩu mới' })
  @IsString()
  @Validate(MatchPasswordConstraint)
  confirmPassword: string;
}
