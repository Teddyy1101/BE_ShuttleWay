import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateStationDto {
  @ApiProperty({ description: 'Chỉ số trạm tiếp theo (bắt đầu từ 0)', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  nextStationIndex: number;
}
