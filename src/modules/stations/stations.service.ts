import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { QueryStationsDto } from './dto/query-stations.dto';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Tạo trạm dừng mới — bắt lỗi trùng tên (unique constraint trên trường name)
  async create(createStationDto: CreateStationDto) {
    try {
      return await this.prisma.station.create({
        data: createStationDto,
      });
    } catch (error) {
      // Bắt lỗi Prisma P2002: vi phạm ràng buộc unique trên trường name
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tên trạm này đã tồn tại trong hệ thống');
      }
      throw error;
    }
  }

  async findAll(query: QueryStationsDto) {
    const { search, isActive, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    // Tìm kiếm theo tên trạm (thay thế filter routeId cũ)
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (isActive !== undefined) where.isActive = isActive;

    const [stations, total] = await this.prisma.$transaction([
      this.prisma.station.findMany({
        where,
        skip,
        take: limit,
        // Sắp xếp theo thời gian tạo thay vì orderIndex (đã chuyển sang RouteStation)
        orderBy: { createdAt: 'desc' },
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
      // Include bảng trung gian routeStations để biết trạm thuộc những tuyến nào
      include: {
        routeStations: {
          include: { route: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    if (!station) {
      throw new NotFoundException(`Không tìm thấy trạm dừng với ID ${id}`);
    }
    return station;
  }

  // Cập nhật trạm — bắt lỗi trùng tên khi đổi tên trạm
  async update(id: string, updateStationDto: UpdateStationDto) {
    await this.findOne(id); // Kiểm tra xem trạm có tồn tại không
    try {
      return await this.prisma.station.update({
        where: { id },
        data: updateStationDto,
      });
    } catch (error) {
      // Bắt lỗi Prisma P2002: vi phạm ràng buộc unique khi đổi tên trùng
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tên trạm này đã tồn tại trong hệ thống');
      }
      throw error;
    }
  }

  // Xóa mềm trạm dừng (không còn logic reorder theo routeId cũ vì đã chuyển sang RouteStation)
  async remove(id: string) {
    await this.findOne(id); // Kiểm tra xem trạm có tồn tại không
    await this.prisma.station.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Đã tạm dừng hoạt động trạm dừng thành công' };
  }

  // Chuyển đổi trạng thái hoạt động của trạm dừng (bật/tắt)
  // Đã loại bỏ logic reorder theo routeId cũ — thứ tự trạm giờ quản lý qua RouteStation
  async toggleStatus(id: string) {
    const station = await this.prisma.station.findUnique({ where: { id } });
    if (!station) {
      throw new NotFoundException(`Không tìm thấy trạm dừng với ID ${id}`);
    }

    const newStatus = !station.isActive;
    await this.prisma.station.update({
      where: { id },
      data: { isActive: newStatus },
    });

    return {
      message: newStatus
        ? 'Đã kích hoạt trạm dừng thành công'
        : 'Đã tạm dừng hoạt động trạm dừng thành công',
    };
  }
}
