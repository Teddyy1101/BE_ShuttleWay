import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { QueryBusesDto } from './dto/query-buses.dto';

@Injectable()
export class BusesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createBusDto: CreateBusDto) {
    return this.prisma.bus.create({
      data: createBusDto,
    });
  }

  async findAll(query: QueryBusesDto) {
    const { status, isActive, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (isActive !== undefined) where.isActive = isActive;

    const [buses, total] = await this.prisma.$transaction([
      this.prisma.bus.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bus.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách xe buýt thành công',
      result: {
        data: buses,
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
    const bus = await this.prisma.bus.findUnique({
      where: { id },
    });
    if (!bus) {
      throw new NotFoundException(`Không tìm thấy xe buýt với ID ${id}`);
    }
    return bus;
  }

  async update(id: string, updateBusDto: UpdateBusDto) {
    await this.findOne(id); // Kiểm tra xem xe có tồn tại không
    return this.prisma.bus.update({
      where: { id },
      data: updateBusDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Kiểm tra xem xe có tồn tại không
    return this.prisma.bus.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
