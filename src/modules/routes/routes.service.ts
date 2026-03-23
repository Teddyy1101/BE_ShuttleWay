import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { QueryRoutesDto } from './dto/query-routes.dto';

@Injectable()
export class RoutesService {
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

  // Tạo tuyến đường mới — sử dụng Prisma Nested Writes để tạo Route + RouteStation cùng lúc
  async create(createRouteDto: CreateRouteDto) {
    const { estimatedTime, stations, ...rest } = createRouteDto;
    const routeCode = await this.generateRouteCode();

    return this.prisma.route.create({
      data: {
        ...rest,
        routeCode,
        estimatedTime: new Date(estimatedTime),
        // Nested write: tạo các bản ghi RouteStation từ mảng stations truyền vào
        ...(stations && stations.length > 0 && {
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

  // Cập nhật tuyến đường — dùng $transaction để xóa RouteStation cũ và tạo lại danh sách mới
  async update(routeCode: string, updateRouteDto: UpdateRouteDto) {
    const existingRoute = await this.findOne(routeCode); // Kiểm tra tồn tại

    const { stations, estimatedTime, ...rest } = updateRouteDto;
    const data: any = { ...rest };
    if (estimatedTime) {
      data.estimatedTime = new Date(estimatedTime);
    }

    // Nếu có cập nhật danh sách trạm → dùng $transaction để đảm bảo tính đồng bộ
    if (stations) {
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
