import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  @IsString()
  @Matches(UUID_REGEX, { message: 'ID phải có định dạng UUID hợp lệ' })
  @IsOptional()
  studentId?: string;
}
