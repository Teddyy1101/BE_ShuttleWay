import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsUUID, Min } from 'class-validator';

// DTO con cho từng phần tử trong mảng stations — đại diện cho bảng trung gian RouteStation
export class RouteStationItemDto {
  @ApiProperty({ example: 'uuid-station-id', description: 'ID của trạm dừng' })
  @IsUUID()
  @IsNotEmpty()
  stationId: string;

  @ApiProperty({ example: 1, description: 'Thứ tự của trạm dừng trên tuyến đường' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  orderIndex: number;
}
