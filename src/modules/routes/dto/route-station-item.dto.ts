import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';

// Regex chấp nhận mọi chuỗi hex có format UUID (8-4-4-4-12)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DTO con cho từng phần tử trong mảng stations — đại diện cho bảng trung gian RouteStation
export class RouteStationItemDto {
  @ApiProperty({ example: 'uuid-station-id', description: 'ID của trạm dừng' })
  @IsString()
  @IsNotEmpty()
  @Matches(UUID_REGEX, { message: 'stationId phải có định dạng UUID' })
  stationId: string;

  @ApiProperty({ example: 1, description: 'Thứ tự của trạm dừng trên tuyến đường' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  orderIndex: number;
}
