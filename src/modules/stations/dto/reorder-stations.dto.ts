import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class StationOrderItemDto {
  @ApiProperty({ example: 'uuid-station-1', description: 'ID của trạm dừng' })
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 1, description: 'Thứ tự mới của trạm dừng' })
  @IsInt()
  @Type(() => Number)
  orderIndex: number;
}

export class ReorderStationsDto {
  @ApiProperty({ type: [StationOrderItemDto], description: 'Danh sách các trạm cần cập nhật thứ tự' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StationOrderItemDto)
  items: StationOrderItemDto[];
}
