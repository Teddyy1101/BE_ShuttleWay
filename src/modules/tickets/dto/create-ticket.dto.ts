import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TicketType } from '../../../../generated/prisma/client';

export class CreateTicketDto {
  @ApiPropertyOptional({
    description: 'ID học sinh (bắt buộc nếu role PARENT, bỏ qua nếu role STUDENT)',
    example: 'uuid-student',
  })
  @IsString({ message: 'ID học sinh phải là chuỗi' })
  @IsOptional()
  studentId?: string;

  @ApiProperty({ description: 'ID tuyến đường', example: 'uuid-route' })
  @IsString()
  @IsNotEmpty({ message: 'ID tuyến đường không được để trống' })
  routeId: string;

  @ApiProperty({ enum: TicketType, description: 'Loại vé (MONTHLY hoặc SINGLE_TRIP)' })
  @IsEnum(TicketType, { message: 'Loại vé không hợp lệ. Chọn MONTHLY hoặc SINGLE_TRIP' })
  ticketType: TicketType;
}
