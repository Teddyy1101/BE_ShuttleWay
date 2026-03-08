import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { ReorderStationsDto } from './dto/reorder-stations.dto';
import { QueryStationsDto } from './dto/query-stations.dto';

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createStationDto: CreateStationDto) {
    return this.prisma.station.create({
      data: createStationDto,
    });
  }

  async findAll(query: QueryStationsDto) {
    const { routeId, isActive, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (routeId) where.routeId = routeId;
    if (isActive !== undefined) where.isActive = isActive;

    const [stations, total] = await this.prisma.$transaction([
      this.prisma.station.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderIndex: 'asc' },
      }),
      this.prisma.station.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách trạm dừng thành công',
      result: {
        data: stations,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async findOne(id: string) {
    const station = await this.prisma.station.findUnique({
      where: { id },
    });
    if (!station) {
      throw new NotFoundException(`Không tìm thấy trạm dừng với ID ${id}`);
    }
    return station;
  }

  async update(id: string, updateStationDto: UpdateStationDto) {
    await this.findOne(id); // Kiểm tra xem trạm có tồn tại không
    return this.prisma.station.update({
      where: { id },
      data: updateStationDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Kiểm tra xem trạm có tồn tại không
    return this.prisma.station.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async reorder(reorderDto: ReorderStationsDto) {
    const { items } = reorderDto;
    
    // Tạo mảng các câu lệnh cập nhật prisma
    const updateQueries = items.map((item) =>
      this.prisma.station.update({
        where: { id: item.id },
        data: { orderIndex: item.orderIndex },
      }),
    );

    // Thực thi tất cả trong cùng một transaction
    await this.prisma.$transaction(updateQueries);
    
    return { message: 'Cập nhật thứ tự các trạm thành công' };
  }
}
