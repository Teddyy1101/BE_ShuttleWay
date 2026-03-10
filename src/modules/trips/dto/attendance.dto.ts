import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { AttendanceStatus } from '../../../../generated/prisma/client';

export class AttendanceDto {
  @ApiProperty({ description: 'ID học sinh', example: 'uuid-of-student' })
  @IsUUID()
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
