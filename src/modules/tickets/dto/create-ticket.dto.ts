import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { TicketType } from '../../../../generated/prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  @ApiProperty({
    description: 'ID trạm nhà mà học sinh chọn (điểm đón chiều đi, điểm trả chiều về)',
    example: 'uuid-station',
  })
  @IsString()
  @Matches(UUID_REGEX, { message: 'ID trạm phải là UUID hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn trạm đón' })
  selectedStationId: string;
}
