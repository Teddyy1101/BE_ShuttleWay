import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { QueryStationsDto } from './dto/query-stations.dto';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tính khoảng cách giữa 2 tọa độ (theo mét) bằng công thức Haversine
   */
  private haversineDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
  ): number {
    const R = 6371000; // Bán kính Trái Đất (mét)
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Kiểm tra tọa độ mới có quá gần trạm đã tồn tại không (bán kính 500m)
   * @param excludeId - ID trạm cần bỏ qua (khi update chính nó)
   */
  private async checkCoordinateProximity(
    latitude: number, longitude: number, excludeId?: string,
  ) {
    const stations = await this.prisma.station.findMany({
      where: { isActive: true, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

    for (const station of stations) {
      const distance = this.haversineDistance(
        latitude, longitude,
        station.latitude, station.longitude,
      );
      if (distance < 500) {
        throw new ConflictException(
          `Tọa độ quá gần trạm "${station.name}" (cách ${Math.round(distance)}m). Các trạm phải cách nhau ít nhất 500m.`,
        );
      }
    }
  }

  // Tạo trạm dừng mới — validate tên trùng + tọa độ gần nhau
  async create(createStationDto: CreateStationDto) {
    // Kiểm tra tọa độ không quá gần trạm đã có
    await this.checkCoordinateProximity(
      createStationDto.latitude, createStationDto.longitude,
    );

    try {
      return await this.prisma.station.create({
        data: createStationDto,
      });
    } catch (error) {
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

  // Cập nhật trạm — validate tên trùng + tọa độ gần nhau
  async update(id: string, updateStationDto: UpdateStationDto) {
    await this.findOne(id);

    // Nếu cập nhật tọa độ, kiểm tra không quá gần trạm khác
    if (updateStationDto.latitude !== undefined && updateStationDto.longitude !== undefined) {
      await this.checkCoordinateProximity(
        updateStationDto.latitude, updateStationDto.longitude, id,
      );
    }

    try {
      return await this.prisma.station.update({
        where: { id },
        data: updateStationDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tên trạm này đã tồn tại trong hệ thống');
      }
      throw error;
    }
  }

  // Xóa mềm trạm dừng
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.station.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Đã tạm dừng hoạt động trạm dừng thành công' };
  }

  // Chuyển đổi trạng thái hoạt động của trạm dừng (bật/tắt)
  // Khi tắt: gỡ trạm khỏi tất cả tuyến đường đang sử dụng
  async toggleStatus(id: string) {
    const station = await this.prisma.station.findUnique({ where: { id } });
    if (!station) {
      throw new NotFoundException(`Không tìm thấy trạm dừng với ID ${id}`);
    }

    const newStatus = !station.isActive;

    if (!newStatus) {
      // Đang tắt trạm -> gỡ khỏi tất cả tuyến đường
      await this.prisma.$transaction(async (tx) => {
        await tx.station.update({
          where: { id },
          data: { isActive: false },
        });
        await tx.routeStation.deleteMany({
          where: { stationId: id },
        });
      });
      return { message: 'Đã tạm dừng hoạt động trạm dừng và gỡ khỏi các tuyến đường liên quan.' };
    }

    // Đang bật lại trạm
    await this.prisma.station.update({
      where: { id },
      data: { isActive: true },
    });
    return { message: 'Đã kích hoạt trạm dừng thành công' };
  }
}
