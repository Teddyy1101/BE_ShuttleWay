import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class StationOrderItemDto {
  @ApiProperty({ example: 'uuid-station-1', description: 'ID của trạm dừng cần cập nhật' })
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 1, description: 'Thứ tự hiển thị mới của trạm dừng' })
  @IsInt()
  @Type(() => Number)
  orderIndex: number;
}

export class ReorderStationsDto {
  @ApiProperty({ type: [StationOrderItemDto], description: 'Danh sách các ID trạm đi kèm thứ tự mới' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StationOrderItemDto)
  items: StationOrderItemDto[];
}
