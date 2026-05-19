import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AdminLinkDto {
  @ApiProperty({ description: 'UUID của phụ huynh' })
  @IsString()
  @Matches(UUID_REGEX, { message: 'parentId phải là UUID hợp lệ' })
  parentId: string;

  @ApiProperty({ description: 'UUID của học sinh' })
  @IsString()
  @Matches(UUID_REGEX, { message: 'studentId phải là UUID hợp lệ' })
  studentId: string;
}
