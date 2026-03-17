import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({ description: 'Trạng thái hoạt động của tài khoản', example: true })
  @IsBoolean({ message: 'Trạng thái phải là kiểu boolean' })
  isActive: boolean;
}
