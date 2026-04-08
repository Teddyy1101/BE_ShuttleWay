import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class QueryMyScheduleDto {
  @ApiProperty({
    description: 'Ngày cần xem lịch trình (YYYY-MM-DD)',
    example: '2026-04-06',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description:
      'ID học sinh (dùng cho PARENT lọc theo từng học sinh liên kết)',
  })
  @IsUUID()
  @IsOptional()
  studentId?: string;
}
