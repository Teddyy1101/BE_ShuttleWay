import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class LinkByPhoneDto {
  @ApiProperty({ example: '+84987654321', description: 'Số điện thoại của người cần liên kết' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @IsString()
  @Matches(/^(\+84|0)\d{9,10}$/, { message: 'Số điện thoại không hợp lệ. Vui lòng nhập đúng định dạng (VD: 0987654321 hoặc +84987654321)' })
  phone: string;
}
