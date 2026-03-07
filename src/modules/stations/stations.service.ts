import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { ReorderStationsDto } from './dto/reorder-stations.dto';

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createStationDto: CreateStationDto) {
    return this.prisma.station.create({
      data: createStationDto,
    });
  }

  async findAll() {
    return this.prisma.station.findMany({
      orderBy: { orderIndex: 'asc' },
    });
  }

  async findOne(id: string) {
    const station = await this.prisma.station.findUnique({
      where: { id },
    });
    if (!station) {
      throw new NotFoundException(`Station with ID ${id} not found`);
    }
    return station;
  }

  async update(id: string, updateStationDto: UpdateStationDto) {
    await this.findOne(id); // Check if exists
    return this.prisma.station.update({
      where: { id },
      data: updateStationDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Check if exists
    return this.prisma.station.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async reorder(reorderDto: ReorderStationsDto) {
    const { items } = reorderDto;
    
    // Create an array of prisma update queries
    const updateQueries = items.map((item) =>
      this.prisma.station.update({
        where: { id: item.id },
        data: { orderIndex: item.orderIndex },
      }),
    );

    // Execute completely in one transaction
    await this.prisma.$transaction(updateQueries);
    
    return { message: 'Stations reordered successfully' };
  }
}
