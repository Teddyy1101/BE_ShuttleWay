import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { QueryBusesDto } from './dto/query-buses.dto';
import { Prisma } from '../../../generated/prisma/client';

@Injectable()
export class BusesService {
  constructor(private readonly prisma: PrismaService) {}

  // Tạo xe buýt mới — bắt lỗi trùng biển số (unique constraint trên licensePlate)
  async create(createBusDto: CreateBusDto) {
    try {
      return await this.prisma.bus.create({
        data: createBusDto,
      });
    } catch (error) {
      // Bắt lỗi Prisma P2002: vi phạm ràng buộc unique trên trường licensePlate
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Biển số xe này đã tồn tại trong hệ thống');
      }
      throw error;
    }
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

  // Cập nhật xe — bắt lỗi trùng biển số khi đổi biển số
  async update(id: string, updateBusDto: UpdateBusDto) {
    await this.findOne(id); // Kiểm tra xem xe có tồn tại không
    try {
      return await this.prisma.bus.update({
        where: { id },
        data: updateBusDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Biển số xe này đã tồn tại trong hệ thống');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    // Xóa mềm xe và gỡ xe khỏi các chuyến đi PENDING
    await this.prisma.$transaction(async (tx) => {
      await tx.bus.update({
        where: { id },
        data: { isActive: false },
      });
      // Gỡ xe khỏi các chuyến đi đang chờ để phân công xe thay thế
      await tx.trip.updateMany({
        where: { busId: id, status: 'PENDING' },
        data: { busId: null },
      });
    });
    return { message: 'Đã xóa xe buýt. Các chuyến đi đang chờ đã được gỡ xe để phân công lại.' };
  }
}
