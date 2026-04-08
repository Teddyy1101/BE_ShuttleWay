import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { QueryRoutesDto } from './dto/query-routes.dto';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Sinh mã tuyến tự động theo format SW-xx (VD: SW-01, SW-02, ...)
  private async generateRouteCode(): Promise<string> {
    const totalRoutes = await this.prisma.route.count();
    let nextNumber = totalRoutes + 1;

    // Kiểm tra trùng lặp, nếu trùng thì tăng thêm 1
    let routeCode = `SW-${String(nextNumber).padStart(2, '0')}`;
    while (await this.prisma.route.findUnique({ where: { routeCode } })) {
      nextNumber++;
      routeCode = `SW-${String(nextNumber).padStart(2, '0')}`;
    }

    return routeCode;
  }

  /** 
   * Nếu xảy ra lỗi (mất mạng, OSRM sập, timeout...) sẽ trả về 3 giá trị null
   */
  private async calculateRouteMetricsWithOSRM(
    stations: { stationId: string; orderIndex: number }[],
  ): Promise<{
    totalDistance: number | null;
    totalDuration: number | null;
    encodedPolyline: string | null;
  }> {
    const nullResult = {
      totalDistance: null,
      totalDuration: null,
      encodedPolyline: null,
    };

    try {
      // Bước 1: Lấy tọa độ các trạm từ Database
      const stationIds = stations.map((s) => s.stationId);
      const stationRecords = await this.prisma.station.findMany({
        where: { id: { in: stationIds } },
        select: { id: true, latitude: true, longitude: true },
      });

      if (stationRecords.length < 2) {
        this.logger.warn(
          'Cần ít nhất 2 trạm để tính toán lộ trình OSRM, bỏ qua.',
        );
        return nullResult;
      }

      // Bước 2: Sắp xếp theo orderIndex
      const stationMap = new Map(
        stationRecords.map((s) => [s.id, s]),
      );
      const sortedStations = [...stations]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((s) => stationMap.get(s.stationId))
        .filter(Boolean);

      // Bước 3: Ghép chuỗi tọa độ theo format OSRM — longitude,latitude
      const coordinates = sortedStations
        .map((s) => `${s!.longitude},${s!.latitude}`)
        .join(';');

      // Bước 4: Gọi OSRM API
      const url = `http://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        this.logger.warn(
          `OSRM trả về kết quả không hợp lệ: ${data.code ?? 'unknown'}`,
        );
        return nullResult;
      }

      const route = data.routes[0];

      // Bước 5: Bóc tách và chuyển đổi đơn vị
      const totalDistance = Math.round((route.distance / 1000) * 100) / 100; // mét → km, làm tròn 2 số thập phân
      const totalDuration = Math.round(route.duration / 60); // giây → phút, làm tròn số nguyên
      const encodedPolyline = route.geometry as string; // Giữ nguyên chuỗi mã hóa

      this.logger.log(
        `Đã tính toán OSRM thành công: ${totalDistance} km, ${totalDuration} phút`,
      );

      return { totalDistance, totalDuration, encodedPolyline };
    } catch (error) {
      this.logger.warn(
        `Không thể gọi OSRM API, bỏ qua tính toán lộ trình: ${error.message}`,
      );
      return nullResult;
    }
  }

  // Tạo tuyến đường mới — sử dụng Prisma Nested Writes để tạo Route + RouteStation cùng lúc
  async create(createRouteDto: CreateRouteDto) {
    const { estimatedTime, stations, ...rest } = createRouteDto;
    const routeCode = await this.generateRouteCode();

    // Tính toán thông số lộ trình từ OSRM nếu có danh sách trạm
    const routeMetrics =
      stations && stations.length > 0
        ? await this.calculateRouteMetricsWithOSRM(stations)
        : { totalDistance: null, totalDuration: null, encodedPolyline: null };

    return this.prisma.route.create({
      data: {
        ...rest,
        routeCode,
        estimatedTime: new Date(estimatedTime),
        totalDistance: routeMetrics.totalDistance,
        totalDuration: routeMetrics.totalDuration,
        encodedPolyline: routeMetrics.encodedPolyline,
        // Nested write: tạo các bản ghi RouteStation từ mảng stations truyền vào
        ...(stations &&
          stations.length > 0 && {
            routeStations: {
              create: stations.map((item) => ({
                stationId: item.stationId,
                orderIndex: item.orderIndex,
              })),
            },
          }),
      },
      // Include danh sách trạm theo thứ tự để trả về kết quả đầy đủ
      include: {
        routeStations: {
          include: { station: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }

  async findAll(query: QueryRoutesDto) {
    const { shiftType, isActive, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (shiftType) where.shiftType = shiftType;
    if (isActive !== undefined) where.isActive = isActive;

    const [routes, total] = await this.prisma.$transaction([
      this.prisma.route.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        // Include bảng trung gian routeStations kèm chi tiết trạm, sắp xếp theo thứ tự lộ trình
        include: {
          routeStations: {
            include: { station: true },
            orderBy: { orderIndex: 'asc' },
          },
        },
      }),
      this.prisma.route.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách tuyến đường thành công',
      result: {
        data: routes,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async findOne(routeCode: string) {
    const route = await this.prisma.route.findUnique({
      where: { routeCode },
      // Include bảng trung gian routeStations kèm chi tiết trạm, sắp xếp theo lộ trình xe chạy
      include: {
        routeStations: {
          include: { station: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!route) {
      throw new NotFoundException(`Không tìm thấy tuyến đường với mã ${routeCode}`);
    }

    return route;
  }

  /**
   * Tìm tuyến đường theo UUID (dùng nội bộ cho TicketsService, TripsService...)
   */
  async findById(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        routeStations: {
          include: { station: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!route) {
      throw new NotFoundException(`Không tìm thấy tuyến đường với ID ${id}`);
    }

    return route;
  }

  // Cập nhật tuyến đường — dùng $transaction để xóa RouteStation cũ và tạo lại danh sách mới
  async update(routeCode: string, updateRouteDto: UpdateRouteDto) {
    const existingRoute = await this.findOne(routeCode); // Kiểm tra tồn tại

    const { stations, estimatedTime, ...rest } = updateRouteDto;
    const data: any = { ...rest };
    if (estimatedTime) {
      data.estimatedTime = new Date(estimatedTime);
    }

    // Nếu có cập nhật danh sách trạm → tính lại thông số OSRM và dùng $transaction
    if (stations) {
      // Tính toán lại thông số lộ trình từ OSRM
      const routeMetrics =
        await this.calculateRouteMetricsWithOSRM(stations);

      return this.prisma.$transaction(async (tx) => {
        // Bước 1: Xóa toàn bộ RouteStation cũ của tuyến này
        await tx.routeStation.deleteMany({
          where: { routeId: existingRoute.id },
        });

        // Bước 2: Cập nhật thông tin Route + tạo lại danh sách RouteStation mới
        return tx.route.update({
          where: { routeCode },
          data: {
            ...data,
            totalDistance: routeMetrics.totalDistance,
            totalDuration: routeMetrics.totalDuration,
            encodedPolyline: routeMetrics.encodedPolyline,
            routeStations: {
              create: stations.map((item) => ({
                stationId: item.stationId,
                orderIndex: item.orderIndex,
              })),
            },
          },
          include: {
            routeStations: {
              include: { station: true },
              orderBy: { orderIndex: 'asc' },
            },
          },
        });
      });
    }

    // Nếu chỉ cập nhật thông tin Route (không đụng đến stations)
    return this.prisma.route.update({
      where: { routeCode },
      data,
      include: {
        routeStations: {
          include: { station: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }

  async remove(routeCode: string) {
    await this.findOne(routeCode); // Kiểm tra xem tuyến đường có tồn tại không
    return this.prisma.route.update({
      where: { routeCode },
      data: { isActive: false },
    });
  }
}
