import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { QueryRoutesDto } from './dto/query-routes.dto';
import { Direction, ShiftType } from '../../../generated/prisma/client';

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
    const { shiftType, direction, isActive, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (shiftType) where.shiftType = shiftType;
    if (direction) where.direction = direction;
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

  async findOne(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        stations: {
          orderBy: {
            orderIndex: 'asc',
          },
        },
      },
    });
    
    if (!route) {
      throw new NotFoundException(`Không tìm thấy tuyến đường với ID ${id}`);
    }
    
    return route;
  }

  async update(id: string, updateRouteDto: UpdateRouteDto) {
    await this.findOne(id); // Kiểm tra xem tuyến đường có tồn tại không
    
    const data: any = { ...updateRouteDto };
    if (updateRouteDto.estimatedTime) {
      data.estimatedTime = new Date(updateRouteDto.estimatedTime);
    }
    
    return this.prisma.route.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Kiểm tra xem tuyến đường có tồn tại không
    return this.prisma.route.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
