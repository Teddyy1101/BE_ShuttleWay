import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { TicketType } from '../../../../generated/prisma/client';

export class CreateTicketDto {
  @ApiProperty({ description: 'ID học sinh', example: 'uuid-student' })
  @IsString()
  @IsNotEmpty({ message: 'ID học sinh không được để trống' })
  studentId: string;

  @ApiProperty({ description: 'ID tuyến đường', example: 'uuid-route' })
  @IsString()
  @IsNotEmpty({ message: 'ID tuyến đường không được để trống' })
  routeId: string;

  @ApiProperty({ enum: TicketType, description: 'Loại vé (MONTHLY hoặc SINGLE_TRIP)' })
  @IsEnum(TicketType, { message: 'Loại vé không hợp lệ. Chọn MONTHLY hoặc SINGLE_TRIP' })
  ticketType: TicketType;
}
