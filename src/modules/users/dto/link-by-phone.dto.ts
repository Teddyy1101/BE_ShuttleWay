import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber } from 'class-validator';

export class LinkByPhoneDto {
  @ApiProperty({ example: '+84987654321', description: 'Số điện thoại của người cần liên kết' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @IsPhoneNumber(undefined, { message: 'Số điện thoại không hợp lệ' })
  phone: string;
}
