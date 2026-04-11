import { IsArray, IsEnum, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO đại diện cho một tin nhắn trong lịch sử hội thoại.
 */
export class ChatMessageDto {
  @ApiProperty({
    description: 'Vai trò của người gửi tin nhắn',
    enum: ['user', 'model'],
    example: 'user',
  })
  @IsEnum(['user', 'model'], { message: 'role phải là "user" hoặc "model"' })
  role: 'user' | 'model';

  @ApiProperty({
    description: 'Nội dung tin nhắn',
    example: 'Vé tháng tuyến Mỹ Đình bao nhiêu tiền?',
  })
  @IsString({ message: 'content phải là chuỗi' })
  @IsNotEmpty({ message: 'content không được để trống' })
  content: string;
}

/**
 * DTO cho request gửi tin nhắn tới Chatbot AI.
 */
export class ChatbotAskDto {
  @ApiProperty({
    description: 'Tin nhắn hiện tại của người dùng',
    example: 'Có những tuyến đường nào?',
  })
  @IsString({ message: 'message phải là chuỗi' })
  @IsNotEmpty({ message: 'message không được để trống' })
  message: string;

  @ApiProperty({
    description: 'Lịch sử hội thoại (tối đa 10 cặp tin nhắn)',
    type: [ChatMessageDto],
    required: false,
    default: [],
  })
  @IsArray({ message: 'history phải là mảng' })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history: ChatMessageDto[];
}
