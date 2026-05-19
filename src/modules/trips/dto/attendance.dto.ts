import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { AttendanceStatus } from '../../../../generated/prisma/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AttendanceDto {
  @ApiProperty({ description: 'ID học sinh', example: 'uuid-of-student' })
  @IsString()
  @Matches(UUID_REGEX, { message: 'ID phải có định dạng UUID hợp lệ' })
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    enum: [AttendanceStatus.BOARDED, AttendanceStatus.ALIGHTED, AttendanceStatus.ABSENT],
    description: 'Trạng thái điểm danh (BOARDED, ALIGHTED, ABSENT)',
    example: 'BOARDED',
  })
  @IsEnum(AttendanceStatus)
  @IsNotEmpty()
  status: AttendanceStatus;
}
