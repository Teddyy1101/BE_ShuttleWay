import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ description: 'ID người nhận', example: 'uuid-receiver' })
  @IsString()
  @IsNotEmpty({ message: 'ID người nhận không được để trống' })
  receiverId: string;

  @ApiProperty({ description: 'Nội dung tin nhắn', example: 'Xin chào!' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung tin nhắn không được để trống' })
  content: string;
}
