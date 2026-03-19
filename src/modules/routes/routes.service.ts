import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { QueryRoutesDto } from './dto/query-routes.dto';
import { ShiftType } from '../../../generated/prisma/client';

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createRouteDto: CreateRouteDto) {
    const { estimatedTime, ...rest } = createRouteDto;
    return this.prisma.route.create({
      data: {
        ...rest,
        estimatedTime: new Date(estimatedTime), // Chuyển đổi sang DateTime
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
      include: {
        stations: {
          where: { isActive: true },
          orderBy: {
            orderIndex: 'asc',
          },
        },
      },
    });
    
    if (!route) {
      throw new NotFoundException(`Không tìm thấy tuyến đường với mã ${routeCode}`);
    }
    
    return route;
  }

  async update(routeCode: string, updateRouteDto: UpdateRouteDto) {
    await this.findOne(routeCode); // Kiểm tra xem tuyến đường có tồn tại không
    
    const data: any = { ...updateRouteDto };
    if (updateRouteDto.estimatedTime) {
      data.estimatedTime = new Date(updateRouteDto.estimatedTime);
    }
    
    return this.prisma.route.update({
      where: { routeCode },
      data,
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
