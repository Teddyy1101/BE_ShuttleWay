import {
  Injectable,
  Inject,
  forwardRef,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { QueryTripsDto } from './dto/query-trips.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { AttendanceDto } from './dto/attendance.dto';
import { TripStatus, AttendanceStatus } from '../../../generated/prisma/client';

// Tọa độ giả lập tuyến đường ngắn (khu vực TP.HCM)
const MOCK_ROUTE_COORDINATES: { lat: number; lng: number }[] = [
  { lat: 10.7769, lng: 106.7009 }, // Điểm xuất phát
  { lat: 10.7785, lng: 106.6990 },
  { lat: 10.7800, lng: 106.6965 },
  { lat: 10.7820, lng: 106.6940 },
  { lat: 10.7835, lng: 106.6915 },
  { lat: 10.7850, lng: 106.6890 },
  { lat: 10.7870, lng: 106.6865 },
  { lat: 10.7885, lng: 106.6845 },
  { lat: 10.7900, lng: 106.6820 },
  { lat: 10.7920, lng: 106.6800 }, // Điểm cuối
];

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => TrackingGateway))
    private readonly trackingGateway: TrackingGateway,
  ) {}

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

    const updatedTrip = await this.prisma.trip.update({
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

    // Fire-and-forget: Gửi push notification cho students + parents có vé ACTIVE thuộc route này
    this.notifyTripStarted(trip.routeId, updatedTrip.route.name).catch(
      (err) => this.logger.error('Lỗi gửi thông báo khởi hành', err.message),
    );

    return updatedTrip;
  }

  /**
   * Gửi push notification cho students và parents có vé ACTIVE thuộc route
   */
  private async notifyTripStarted(routeId: string, routeName: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { routeId, status: 'ACTIVE', isActive: true },
      select: { studentId: true, parentId: true },
    });

    // Lấy danh sách userId duy nhất (students + parents)
    const userIds = new Set<string>();
    for (const ticket of tickets) {
      userIds.add(ticket.studentId);
      if (ticket.parentId) userIds.add(ticket.parentId);
    }

    const title = 'Xe buýt đã khởi hành!';
    const body = `Chuyến xe tuyến ${routeName} đã bắt đầu di chuyển.`;

    const promises = Array.from(userIds).map((userId) =>
      this.notificationsService
        .sendPushNotification(userId, title, body)
        .catch((err) => this.logger.warn(`Lỗi gửi FCM cho user ${userId}`, err.message)),
    );

    await Promise.all(promises);
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

    let result;
    if (existing) {
      // Cập nhật bản ghi hiện có
      result = await this.prisma.tripAttendance.update({
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
      result = await this.prisma.tripAttendance.create({
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

    // Fire-and-forget: Gửi push notification cho phụ huynh khi BOARDED hoặc ALIGHTED
    if (
      attendanceDto.status === AttendanceStatus.BOARDED ||
      attendanceDto.status === AttendanceStatus.ALIGHTED
    ) {
      this.notifyAttendance(
        attendanceDto.studentId,
        student.fullName,
        attendanceDto.status,
        now,
      ).catch((err) =>
        this.logger.error('Lỗi gửi thông báo điểm danh', err.message),
      );
    }

    return result;
  }

  /**
   * Gửi push notification cho phụ huynh khi học sinh điểm danh
   */
  private async notifyAttendance(
    studentId: string,
    studentName: string,
    status: AttendanceStatus,
    time: Date,
  ) {
    // Lấy danh sách phụ huynh liên kết với học sinh
    const parentLinks = await this.prisma.parentStudent.findMany({
      where: { studentId, isActive: true },
      select: { parentId: true },
    });

    if (parentLinks.length === 0) return;

    const timeStr = time.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const isBoarded = status === AttendanceStatus.BOARDED;
    const title = isBoarded ? 'Học sinh đã lên xe' : 'Học sinh đã xuống xe';
    const body = isBoarded
      ? `Học sinh ${studentName} đã lên xe lúc ${timeStr}.`
      : `Học sinh ${studentName} đã xuống xe lúc ${timeStr}.`;

    const promises = parentLinks.map((link) =>
      this.notificationsService
        .sendPushNotification(link.parentId, title, body)
        .catch((err) =>
          this.logger.warn(`Lỗi gửi FCM cho parent ${link.parentId}`, err.message),
        ),
    );

    await Promise.all(promises);
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

  /**
   * Giả lập chuyến đi: phát tọa độ mô phỏng qua WebSocket
   */
  async simulateTrip(tripId: string) {
    // Validate chuyến đi tồn tại
    await this.findOne(tripId);

    // Gọi TrackingGateway để bắt đầu giả lập
    this.trackingGateway.startSimulation(tripId, MOCK_ROUTE_COORDINATES);

    return {
      message: 'Bắt đầu giả lập chuyến đi',
      result: {
        tripId,
        totalPoints: MOCK_ROUTE_COORDINATES.length,
        intervalMs: 2000,
      },
    };
  }
}
