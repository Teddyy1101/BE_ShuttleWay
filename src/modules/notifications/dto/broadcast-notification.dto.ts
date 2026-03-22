import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { Role } from 'generated/prisma/enums';

export class BroadcastNotificationDto {
  @ApiProperty({ example: 'Thông báo bảo trì hệ thống', description: 'Tiêu đề thông báo' })
  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  title: string;

  @ApiProperty({ example: 'Hệ thống sẽ bảo trì từ 22h-23h ngày 21/03', description: 'Nội dung chi tiết' })
  @IsString()
  @IsNotEmpty({ message: 'Nội dung không được để trống' })
  body: string;

  @ApiPropertyOptional({ enum: ['STUDENT', 'PARENT', 'DRIVER'], description: 'Lọc theo vai trò người nhận' })
  @IsEnum(Role, { message: 'Vai trò không hợp lệ' })
  @IsOptional()
  targetRole?: Role;

  @ApiPropertyOptional({ description: 'UUID tuyến đường - lọc học sinh thuộc tuyến qua bảng Ticket' })
  @IsUUID('4', { message: 'routeId không hợp lệ' })
  @IsOptional()
  routeId?: string;

  @ApiPropertyOptional({ description: 'UUID chuyến đi - lọc học sinh thuộc chuyến qua bảng TripAttendance' })
  @IsUUID('4', { message: 'tripId không hợp lệ' })
  @IsOptional()
  tripId?: string;
}
