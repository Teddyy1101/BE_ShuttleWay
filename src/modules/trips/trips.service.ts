import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { QueryTripsDto } from './dto/query-trips.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { AttendanceDto } from './dto/attendance.dto';
import { TripStatus, AttendanceStatus } from '../../../generated/prisma/client';

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  // API cho ADMIN

  async create(createTripDto: CreateTripDto) {
    // Kiểm tra tuyến đường tồn tại
    const route = await this.prisma.route.findUnique({
      where: { id: createTripDto.routeId },
    });
    if (!route) {
      throw new NotFoundException(
        `Không tìm thấy tuyến đường với ID ${createTripDto.routeId}`,
      );
    }

    // Kiểm tra xe buýt tồn tại (nếu có)
    if (createTripDto.busId) {
      const bus = await this.prisma.bus.findUnique({
        where: { id: createTripDto.busId },
      });
      if (!bus) {
        throw new NotFoundException(
          `Không tìm thấy xe buýt với ID ${createTripDto.busId}`,
        );
      }
    }

    // Kiểm tra tài xế tồn tại và có role DRIVER (nếu có)
    if (createTripDto.driverId) {
      const driver = await this.prisma.user.findUnique({
        where: { id: createTripDto.driverId },
      });
      if (!driver) {
        throw new NotFoundException(
          `Không tìm thấy tài xế với ID ${createTripDto.driverId}`,
        );
      }
      if (driver.role !== 'DRIVER') {
        throw new BadRequestException(
          `Người dùng với ID ${createTripDto.driverId} không phải là tài xế`,
        );
      }
    }

    return this.prisma.trip.create({
      data: {
        routeId: createTripDto.routeId,
        busId: createTripDto.busId,
        driverId: createTripDto.driverId,
        scheduledDate: new Date(createTripDto.scheduledDate),
        startTime: createTripDto.startTime
          ? new Date(createTripDto.startTime)
          : undefined,
        status: TripStatus.PENDING,
      },
      include: {
        route: true,
        bus: true,
        driver: true,
      },
    });
  }

  async findAll(query: QueryTripsDto) {
    const { status, scheduledDate, routeId, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (status) where.status = status;
    if (scheduledDate) where.scheduledDate = new Date(scheduledDate);
    if (routeId) where.routeId = routeId;

    const [trips, total] = await this.prisma.$transaction([
      this.prisma.trip.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          route: true,
          bus: true,
          driver: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.trip.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách chuyến đi thành công',
      result: {
        data: trips,
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
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        route: true,
        bus: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến đi với ID ${id}`);
    }
    return trip;
  }

  async update(id: string, updateTripDto: UpdateTripDto) {
    await this.findOne(id);

    const data: any = { ...updateTripDto };
    if (updateTripDto.scheduledDate) {
      data.scheduledDate = new Date(updateTripDto.scheduledDate);
    }
    if (updateTripDto.startTime) {
      data.startTime = new Date(updateTripDto.startTime);
    }

    return this.prisma.trip.update({
      where: { id },
      data,
      include: {
        route: true,
        bus: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.trip.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // API cho DRIVER
  /**
   * Kiểm tra tài xế có được gán cho chuyến đi không
   */
  private async verifyDriver(tripId: string, driverId: string) {
    const trip = await this.findOne(tripId);
    if (trip.driverId !== driverId) {
      throw new ForbiddenException(
        'Bạn không phải là tài xế được gán cho chuyến đi này',
      );
    }
    return trip;
  }

  async startTrip(id: string, driverId: string) {
    const trip = await this.verifyDriver(id, driverId);

    if (trip.status !== TripStatus.PENDING) {
      throw new BadRequestException(
        `Không thể bắt đầu chuyến đi. Trạng thái hiện tại: ${trip.status}. Chỉ chuyến đi ở trạng thái PENDING mới có thể bắt đầu`,
      );
    }

    return this.prisma.trip.update({
      where: { id },
      data: {
        status: TripStatus.IN_PROGRESS,
        startTime: new Date(),
      },
      include: {
        route: true,
        bus: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async updateStation(
    id: string,
    driverId: string,
    updateStationDto: UpdateStationDto,
  ) {
    const trip = await this.verifyDriver(id, driverId);

    if (trip.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Không thể cập nhật trạm. Trạng thái hiện tại: ${trip.status}. Chỉ chuyến đi đang IN_PROGRESS mới có thể cập nhật trạm`,
      );
    }

    // Kiểm tra nextStationIndex hợp lệ
    const stationsCount = await this.prisma.station.count({
      where: { routeId: trip.routeId, isActive: true },
    });

    if (updateStationDto.nextStationIndex >= stationsCount) {
      throw new BadRequestException(
        `Chỉ số trạm không hợp lệ. Tuyến đường này chỉ có ${stationsCount} trạm (chỉ số từ 0 đến ${stationsCount - 1})`,
      );
    }

    return this.prisma.trip.update({
      where: { id },
      data: {
        currentStation: updateStationDto.nextStationIndex,
      },
      include: {
        route: {
          include: {
            stations: {
              where: { isActive: true },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        bus: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async completeTrip(id: string, driverId: string) {
    const trip = await this.verifyDriver(id, driverId);

    if (trip.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Không thể hoàn thành chuyến đi. Trạng thái hiện tại: ${trip.status}. Chỉ chuyến đi đang IN_PROGRESS mới có thể hoàn thành`,
      );
    }

    return this.prisma.trip.update({
      where: { id },
      data: {
        status: TripStatus.COMPLETED,
        endTime: new Date(),
      },
      include: {
        route: true,
        bus: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async markAttendance(
    tripId: string,
    driverId: string,
    attendanceDto: AttendanceDto,
  ) {
    const trip = await this.verifyDriver(tripId, driverId);

    if (
      trip.status === TripStatus.COMPLETED ||
      trip.status === TripStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Không thể điểm danh. Chuyến đi đã ở trạng thái ${trip.status}`,
      );
    }

    // Kiểm tra học sinh tồn tại
    const student = await this.prisma.user.findUnique({
      where: { id: attendanceDto.studentId },
    });
    if (!student) {
      throw new NotFoundException(
        `Không tìm thấy học sinh với ID ${attendanceDto.studentId}`,
      );
    }
    if (student.role !== 'STUDENT') {
      throw new BadRequestException(
        `Người dùng với ID ${attendanceDto.studentId} không phải là học sinh`,
      );
    }

    // Xác định thời gian boardedAt / alightedAt
    const now = new Date();
    const timeData: any = {};
    if (attendanceDto.status === AttendanceStatus.BOARDED) {
      timeData.boardedAt = now;
    } else if (attendanceDto.status === AttendanceStatus.ALIGHTED) {
      timeData.alightedAt = now;
    }

    // Tìm xem đã có bản ghi điểm danh chưa (upsert)
    const existing = await this.prisma.tripAttendance.findFirst({
      where: {
        tripId,
        studentId: attendanceDto.studentId,
      },
    });

    if (existing) {
      // Cập nhật bản ghi hiện có
      return this.prisma.tripAttendance.update({
        where: { id: existing.id },
        data: {
          status: attendanceDto.status,
          ...timeData,
        },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });
    } else {
      // Tạo bản ghi mới
      return this.prisma.tripAttendance.create({
        data: {
          tripId,
          studentId: attendanceDto.studentId,
          status: attendanceDto.status,
          ...timeData,
        },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });
    }
  }

  // API cho PARENT / STUDENT
  async getTracking(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        route: {
          include: {
            stations: {
              where: { isActive: true },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        bus: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            avatarUrl: true,
          },
        },
        attendances: {
          where: { isActive: true },
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến đi với ID ${id}`);
    }

    return trip;
  }
}
