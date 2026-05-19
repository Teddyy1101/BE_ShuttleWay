import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AdminLinkDto {
  @ApiProperty({ description: 'UUID của phụ huynh' })
  @IsUUID('all', { message: 'parentId phải là UUID hợp lệ' })
  parentId: string;

  @ApiProperty({ description: 'UUID của học sinh' })
  @IsUUID('all', { message: 'studentId phải là UUID hợp lệ' })
  studentId: string;
}
