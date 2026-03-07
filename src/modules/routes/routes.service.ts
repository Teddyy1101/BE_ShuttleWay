import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { Direction, ShiftType } from '../../../generated/prisma/client';

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createRouteDto: CreateRouteDto) {
    const { estimatedTime, ...rest } = createRouteDto;
    return this.prisma.route.create({
      data: {
        ...rest,
        estimatedTime: new Date(estimatedTime), // Parse to DateTime
      },
    });
  }

  async findAll(shiftType?: ShiftType, direction?: Direction, isActive?: boolean) {
    const where: any = {};
    if (shiftType) where.shiftType = shiftType;
    if (direction) where.direction = direction;
    if (isActive !== undefined) where.isActive = isActive;

    return this.prisma.route.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
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
      throw new NotFoundException(`Route with ID ${id} not found`);
    }
    
    return route;
  }

  async update(id: string, updateRouteDto: UpdateRouteDto) {
    await this.findOne(id); // Check if exists
    
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
    await this.findOne(id); // Check if exists
    return this.prisma.route.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
