import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateTicketReplyDto {
  @ApiProperty({ description: 'Nội dung câu trả lời' })
  @IsString({ message: 'Nội dung phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  content: string;

  @ApiPropertyOptional({ description: 'ID người trả lời (Admin hoặc User)', example: 'uuid-sender' })
  @IsString()
  @Matches(UUID_REGEX, { message: 'ID người gửi không hợp lệ' })
  @IsOptional()
  senderId?: string;
}
