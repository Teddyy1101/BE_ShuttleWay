import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTicketReplyDto {
  @ApiProperty({ description: 'Nội dung câu trả lời' })
  @IsString({ message: 'Nội dung phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  content: string;

  @ApiPropertyOptional({ description: 'ID người trả lời (Admin hoặc User)', example: 'uuid-sender' })
  @IsUUID('4', { message: 'ID người gửi không hợp lệ' })
  @IsOptional()
  senderId?: string;
}
