import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { TrackingGateway } from '../tracking/tracking.gateway';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { QueryTripsDto } from './dto/query-trips.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { AttendanceDto } from './dto/attendance.dto';
import { QueryMyScheduleDto } from './dto/query-my-schedule.dto';
import { TripStatus, AttendanceStatus } from '../../../generated/prisma/client';


@Injectable()
export class TripsService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => require('../tracking/tracking.gateway').TrackingGateway))
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

    const scheduledDate = new Date(createTripDto.scheduledDate);

    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo chuyến đi
      const trip = await tx.trip.create({
        data: {
          routeId: createTripDto.routeId,
          direction: createTripDto.direction,
          busId: createTripDto.busId,
          driverId: createTripDto.driverId,
          scheduledDate,
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

      // 2. Tìm tất cả học sinh có vé ACTIVE trên tuyến, còn hiệu lực tại ngày chạy
      const activeTickets = await tx.ticket.findMany({
        where: {
          routeId: createTripDto.routeId,
          status: 'ACTIVE',
          isActive: true,
          validFrom: { lte: scheduledDate },
          validUntil: { gte: scheduledDate },
        },
        select: { studentId: true },
      });

      // 3. Deduplicate studentIds và tạo TripAttendance hàng loạt
      const studentIds = [
        ...new Set(activeTickets.map((t) => t.studentId)),
      ];

      if (studentIds.length > 0) {
        await tx.tripAttendance.createMany({
          data: studentIds.map((sid) => ({
            tripId: trip.id,
            studentId: sid,
            status: 'PENDING' as const,
          })),
        });

      }

      return trip;
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
          _count: {
            select: { attendances: true },
          },
          attendances: {
            where: { isActive: true },
            select: { status: true },
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

  // ========================
  // API ADMIN - Quản lý chuyến đi nâng cao
  // ========================

  /**
   * Lấy chi tiết chuyến đi kèm danh sách điểm danh (dành cho ADMIN)
   */
  async findOneWithAttendances(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        route: {
          include: {
            routeStations: {
              orderBy: { orderIndex: 'asc' },
              include: { station: true },
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
   * Admin điểm danh thủ công (không cần kiểm tra driverId)
   */
  async adminMarkAttendance(tripId: string, attendanceDto: AttendanceDto) {
    const trip = await this.findOne(tripId);

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
      where: { tripId, studentId: attendanceDto.studentId },
    });

    if (existing) {
      return this.prisma.tripAttendance.update({
        where: { id: existing.id },
        data: { status: attendanceDto.status, ...timeData },
        include: {
          student: {
            select: { id: true, fullName: true, phone: true, email: true, avatarUrl: true },
          },
        },
      });
    }

    return this.prisma.tripAttendance.create({
      data: {
        tripId,
        studentId: attendanceDto.studentId,
        status: attendanceDto.status,
        ...timeData,
      },
      include: {
        student: {
          select: { id: true, fullName: true, phone: true, email: true, avatarUrl: true },
        },
      },
    });
  }

  /**
   * Admin kết thúc chuyến đi thủ công (IN_PROGRESS → COMPLETED)
   */
  async adminCompleteTrip(id: string) {
    const trip = await this.findOne(id);

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
          select: { id: true, fullName: true, phone: true, email: true, avatarUrl: true },
        },
      },
    });
  }

  /**
   * Admin hủy chuyến đi đột xuất (PENDING/IN_PROGRESS → CANCELLED)
   */
  async adminCancelTrip(id: string) {
    const trip = await this.findOne(id);

    if (
      trip.status === TripStatus.COMPLETED ||
      trip.status === TripStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Không thể hủy chuyến đi. Trạng thái hiện tại: ${trip.status}`,
      );
    }

    const updatedTrip = await this.prisma.trip.update({
      where: { id },
      data: { status: TripStatus.CANCELLED },
      include: {
        route: true,
        bus: true,
        driver: {
          select: { id: true, fullName: true, phone: true, email: true, avatarUrl: true },
        },
      },
    });

    // Fire-and-forget: Gửi thông báo hủy chuyến cho phụ huynh
    this.notifyTripCancelled(trip.routeId, updatedTrip.route.name).catch(() => {});

    return updatedTrip;
  }

  /**
   * Gửi push notification cho phụ huynh khi hủy chuyến
   */
  private async notifyTripCancelled(routeId: string, routeName: string) {
    const tickets = await this.prisma.ticket.findMany({
      where: { routeId, status: 'ACTIVE', isActive: true },
      select: { studentId: true, parentId: true },
    });

    const userIds = new Set<string>();
    for (const ticket of tickets) {
      if (ticket.parentId) userIds.add(ticket.parentId);
    }

    const title = 'Chuyến xe bị hủy!';
    const body = `Chuyến xe tuyến ${routeName} hôm nay đã bị hủy. Vui lòng chủ động đưa đón con em.`;

    const promises = Array.from(userIds).map((userId) =>
      this.notificationsService
        .sendPushNotification(userId, title, body)
        .catch(() => {}),
    );

    await Promise.all(promises);
  }

  // API cho DRIVER

  /**
   * Lấy danh sách chuyến đi được gán cho tài xế theo ngày.
   * Mặc định lấy ngày hôm nay nếu không truyền date.
   */
  async getMyDriverTrips(driverId: string, date?: string) {
    let targetDate: Date;
    if (date) {
      const [year, month, day] = date.split('-').map(Number);
      targetDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      const now = new Date();
      targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));
    }

    const trips = await this.prisma.trip.findMany({
      where: {
        driverId,
        isActive: true,
        scheduledDate: targetDate,
        status: {
          in: [TripStatus.PENDING, TripStatus.IN_PROGRESS, TripStatus.COMPLETED],
        },
      },
      include: {
        route: {
          include: {
            routeStations: {
              orderBy: { orderIndex: 'asc' },
              include: { station: true },
            },
          },
        },
        bus: true,
        _count: {
          select: { attendances: true },
        },
      },
      orderBy: [
        { status: 'asc' },
        { scheduledDate: 'asc' },
      ],
    });

    return {
      message: 'Lấy danh sách chuyến đi của tài xế thành công',
      result: trips,
    };
  }

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

    // Fire-and-forget: Gửi push notification cho students + parents + driver
    this.notifyTripStarted(trip.routeId, updatedTrip.route.name, driverId).catch(() => {});

    return updatedTrip;
  }

  /**
   * Gửi push notification cho students, parents và driver khi xe khởi hành
   */
  private async notifyTripStarted(
    routeId: string,
    routeName: string,
    driverId: string,
  ) {
    const tickets = await this.prisma.ticket.findMany({
      where: { routeId, status: 'ACTIVE', isActive: true },
      select: { studentId: true, parentId: true },
    });

    // Lấy danh sách userId duy nhất (students + parents + driver)
    const userIds = new Set<string>();
    userIds.add(driverId);
    for (const ticket of tickets) {
      userIds.add(ticket.studentId);
      if (ticket.parentId) userIds.add(ticket.parentId);
    }

    const title = 'Xe buýt đã khởi hành!';
    const body = `Chuyến xe tuyến ${routeName} đã bắt đầu di chuyển.`;

    const promises = Array.from(userIds).map((userId) =>
      this.notificationsService
        .sendPushNotification(userId, title, body)
        .catch(() => {}),
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
    const stationsCount = await this.prisma.routeStation.count({
      where: { routeId: trip.routeId },
    });

    if (updateStationDto.nextStationIndex >= stationsCount) {
      throw new BadRequestException(
        `Chỉ số trạm không hợp lệ. Tuyến đường này chỉ có ${stationsCount} trạm (chỉ số từ 0 đến ${stationsCount - 1})`,
      );
    }

    const updatedTrip = await this.prisma.trip.update({
      where: { id },
      data: {
        currentStation: updateStationDto.nextStationIndex,
      },
      include: {
        route: {
          include: {
            routeStations: {
              orderBy: { orderIndex: 'asc' },
              include: { station: true },
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

    // Lấy tên trạm vừa đến
    const currentRouteStation = updatedTrip.route.routeStations.find(
      (rs) => rs.orderIndex === updateStationDto.nextStationIndex,
    );
    const stationName = currentRouteStation?.station?.name ?? 'N/A';

    // Fire-and-forget: Gửi FCM thông báo đến trạm
    this.notifyStationReached(
      trip.routeId,
      updatedTrip.route.name,
      stationName,
      driverId,
    ).catch(() => {});

    return updatedTrip;
  }

  async completeTrip(id: string, driverId: string) {
    const trip = await this.verifyDriver(id, driverId);

    if (trip.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Không thể hoàn thành chuyến đi. Trạng thái hiện tại: ${trip.status}. Chỉ chuyến đi đang IN_PROGRESS mới có thể hoàn thành`,
      );
    }

    const updatedTrip = await this.prisma.trip.update({
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

    // Fire-and-forget: Gửi FCM thông báo hoàn thành chuyến kèm số HS điểm danh
    this.notifyTripCompleted(
      id,
      trip.routeId,
      updatedTrip.route.name,
      driverId,
    ).catch(() => {});

    return updatedTrip;
  }

  /**
   * Gửi FCM thông báo xe đã đến trạm cho students, parents và driver
   */
  private async notifyStationReached(
    routeId: string,
    routeName: string,
    stationName: string,
    driverId: string,
  ) {
    const tickets = await this.prisma.ticket.findMany({
      where: { routeId, status: 'ACTIVE', isActive: true },
      select: { studentId: true, parentId: true },
    });

    const userIds = new Set<string>();
    userIds.add(driverId);
    for (const ticket of tickets) {
      userIds.add(ticket.studentId);
      if (ticket.parentId) userIds.add(ticket.parentId);
    }

    const title = 'Xe đã đến trạm!';
    const body = `Xe tuyến ${routeName} đã đến trạm "${stationName}".`;

    const promises = Array.from(userIds).map((userId) =>
      this.notificationsService
        .sendPushNotification(userId, title, body)
        .catch(() => {}),
    );

    await Promise.all(promises);
  }

  /**
   * Gửi FCM thông báo hoàn thành chuyến xe kèm số HS đã điểm danh
   */
  private async notifyTripCompleted(
    tripId: string,
    routeId: string,
    routeName: string,
    driverId: string,
  ) {
    // Đếm số HS đã điểm danh (BOARDED hoặc ALIGHTED)
    const [attendedCount, totalCount] = await this.prisma.$transaction([
      this.prisma.tripAttendance.count({
        where: {
          tripId,
          isActive: true,
          status: { in: [AttendanceStatus.BOARDED, AttendanceStatus.ALIGHTED] },
        },
      }),
      this.prisma.tripAttendance.count({
        where: { tripId, isActive: true },
      }),
    ]);

    const tickets = await this.prisma.ticket.findMany({
      where: { routeId, status: 'ACTIVE', isActive: true },
      select: { studentId: true, parentId: true },
    });

    const userIds = new Set<string>();
    userIds.add(driverId);
    for (const ticket of tickets) {
      userIds.add(ticket.studentId);
      if (ticket.parentId) userIds.add(ticket.parentId);
    }

    const title = 'Chuyến xe đã hoàn thành!';
    const body = `Chuyến xe tuyến ${routeName} đã hoàn thành. Số HS đã điểm danh: ${attendedCount}/${totalCount}.`;

    const promises = Array.from(userIds).map((userId) =>
      this.notificationsService
        .sendPushNotification(userId, title, body)
        .catch(() => {}),
    );

    await Promise.all(promises);
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
      ).catch(() => {});
    }

    return result;
  }

  /**
   * Lấy danh sách tất cả học sinh + trạng thái điểm danh trong chuyến đi (DRIVER).
   */
  async driverGetTripAttendances(tripId: string, driverId: string) {
    await this.verifyDriver(tripId, driverId);

    const attendances = await this.prisma.tripAttendance.findMany({
      where: { tripId, isActive: true },
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
      orderBy: { createdAt: 'asc' },
    });

    return { attendances };
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
        .catch(() => {}),
    );

    await Promise.all(promises);
  }

  /**
   * Lấy lịch trình chuyến đi theo ngày.
   * Query qua Ticket (vé ACTIVE) → Trip (chuyến thuộc tuyến có vé),
   * kèm trạng thái điểm danh cá nhân (nếu có).
   */
  async getMySchedule(
    currentUser: { id: string; role: string },
    query: QueryMyScheduleDto,
  ) {
    let studentId: string;

    if (currentUser.role === 'STUDENT') {
      studentId = currentUser.id;
    } else {
      // PARENT → bắt buộc chọn học sinh
      if (!query.studentId) {
        throw new BadRequestException(
          'Phụ huynh cần chọn học sinh để xem lịch trình',
        );
      }

      // Validate liên kết parent-student
      const link = await this.prisma.parentStudent.findUnique({
        where: {
          parentId_studentId: {
            parentId: currentUser.id,
            studentId: query.studentId,
          },
        },
      });
      if (!link) {
        throw new BadRequestException(
          'Học sinh không thuộc quyền quản lý của bạn',
        );
      }

      studentId = query.studentId;
    }

    // Parse ngày từ query — dùng UTC để khớp với Prisma @db.Date (lưu UTC midnight)
    const [year, month, day] = query.date.split('-').map(Number);
    const targetDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

    // Bước 1: Tìm routeId từ các vé ACTIVE của học sinh, còn hiệu lực tại ngày đã chọn
    const activeTickets = await this.prisma.ticket.findMany({
      where: {
        studentId,
        status: 'ACTIVE',
        isActive: true,
        validFrom: { lte: targetDate },
        validUntil: { gte: targetDate },
      },
      select: { routeId: true },
    });

    const routeIds = [...new Set(activeTickets.map((t) => t.routeId))];

    if (routeIds.length === 0) {
      return {
        message: 'Lấy lịch trình thành công',
        result: [],
      };
    }

    const trips = await this.prisma.trip.findMany({
      where: {
        routeId: { in: routeIds },
        isActive: true,
        scheduledDate: targetDate,
        status: {
          in: [
            TripStatus.PENDING,
            TripStatus.IN_PROGRESS,
            TripStatus.COMPLETED,
          ],
        },
      },
      include: {
        route: {
          include: {
            routeStations: {
              orderBy: { orderIndex: 'asc' },
              include: { station: true },
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
          where: { studentId, isActive: true },
          select: {
            status: true,
            boardedAt: true,
            alightedAt: true,
          },
          take: 1,
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    // Map response — trả về trip kèm trạng thái điểm danh cá nhân (nếu có)
    const result = trips.map((trip) => {
      const attendance = trip.attendances[0] ?? null;
      const { attendances: _, ...tripData } = trip;
      return {
        ...tripData,
        attendanceStatus: attendance?.status ?? null,
        boardedAt: attendance?.boardedAt ?? null,
        alightedAt: attendance?.alightedAt ?? null,
      };
    });

    return {
      message: 'Lấy lịch trình thành công',
      result,
    };
  }

  /**
   * Lấy danh sách chuyến đi đang hoạt động (IN_PROGRESS) thuộc tuyến mà user có vé ACTIVE.
   */
  async getMyActiveTrips(currentUser: { id: string; role: string }) {
    // Tìm tất cả routeId mà user có vé ACTIVE
    const ticketWhere: any = { status: 'ACTIVE', isActive: true };
    if (currentUser.role === 'STUDENT') {
      ticketWhere.studentId = currentUser.id;
    } else {
      ticketWhere.parentId = currentUser.id;
    }

    const activeTickets = await this.prisma.ticket.findMany({
      where: ticketWhere,
      select: { routeId: true },
    });

    const routeIds = [...new Set(activeTickets.map((t) => t.routeId))];
    if (routeIds.length === 0) {
      return { message: 'Không có chuyến đi đang hoạt động', result: [] };
    }

    // Tìm trips IN_PROGRESS thuộc các route đó
    // Không cần filter scheduledDate vì IN_PROGRESS + isActive đã đủ
    const trips = await this.prisma.trip.findMany({
      where: {
        routeId: { in: routeIds },
        status: TripStatus.IN_PROGRESS,
        isActive: true,
      },
      include: {
        route: {
          include: {
            routeStations: {
              orderBy: { orderIndex: 'asc' },
              include: { station: true },
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
      orderBy: { startTime: 'desc' },
    });

    return {
      message: 'Lấy danh sách chuyến đi đang hoạt động thành công',
      result: trips,
    };
  }

  async getTracking(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        route: {
          include: {
            routeStations: {
              orderBy: { orderIndex: 'asc' },
              include: { station: true },
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
   * Giả lập chuyến đi: phát tọa độ mô phỏng qua WebSocket.
   * Sử dụng tọa độ thực từ các trạm trên tuyến, nội suy thêm điểm giữa.
   */
  async simulateTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        route: {
          include: {
            routeStations: {
              orderBy: { orderIndex: 'asc' },
              include: { station: true },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến đi với ID ${tripId}`);
    }

    // Lấy tọa độ các trạm theo thứ tự
    let stationCoords = trip.route.routeStations.map((rs) => ({
      lat: rs.station.latitude,
      lng: rs.station.longitude,
    }));

    // Nếu chiều về (DROP_OFF), đảo ngược thứ tự
    if (trip.direction === 'DROP_OFF') {
      stationCoords = stationCoords.reverse();
    }

    // Nội suy thêm điểm giữa các trạm (5 điểm giữa mỗi cặp trạm)
    const interpolated: { lat: number; lng: number }[] = [];
    const stepsPerSegment = 5;
    for (let i = 0; i < stationCoords.length - 1; i++) {
      const from = stationCoords[i];
      const to = stationCoords[i + 1];
      interpolated.push(from);
      for (let step = 1; step <= stepsPerSegment; step++) {
        const t = step / (stepsPerSegment + 1);
        interpolated.push({
          lat: from.lat + (to.lat - from.lat) * t,
          lng: from.lng + (to.lng - from.lng) * t,
        });
      }
    }
    // Thêm trạm cuối
    if (stationCoords.length > 0) {
      interpolated.push(stationCoords[stationCoords.length - 1]);
    }

    if (interpolated.length === 0) {
      throw new BadRequestException(
        'Tuyến đường chưa có trạm dừng. Không thể giả lập chuyến đi',
      );
    }

    const coordinates = interpolated;

    this.trackingGateway.startSimulation(tripId, coordinates);

    return {
      message: 'Bắt đầu giả lập chuyến đi',
      result: {
        tripId,
        totalPoints: coordinates.length,
        intervalMs: 2000,
      },
    };
  }

  /**
   * Lấy danh sách học sinh cần đón/trả tại một trạm cụ thể
   */
  async getStudentsAtStation(tripId: string, stationId: string) {
    // Kiểm tra chuyến đi tồn tại
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, routeId: true, status: true },
    });

    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến đi với ID ${tripId}`);
    }

    // Kiểm tra trạm có thuộc tuyến đường của chuyến đi không
    const routeStation = await this.prisma.routeStation.findUnique({
      where: {
        routeId_stationId: { routeId: trip.routeId, stationId },
      },
      include: { station: true },
    });

    if (!routeStation) {
      throw new BadRequestException(
        'Trạm dừng không thuộc tuyến đường của chuyến đi này',
      );
    }

    // Lấy danh sách học sinh cần ĐÓN tại trạm này
    // (TripAttendance đang PENDING + Ticket ACTIVE có pickUpStationId = stationId)
    const studentsToPickUp = await this.prisma.tripAttendance.findMany({
      where: {
        tripId,
        status: AttendanceStatus.PENDING,
        isActive: true,
        student: {
          studentTickets: {
            some: {
              routeId: trip.routeId,
              status: 'ACTIVE',
              isActive: true,
              pickUpStationId: stationId,
            },
          },
        },
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Lấy danh sách học sinh cần TRẢ tại trạm này
    // (TripAttendance đang BOARDED + Ticket ACTIVE có dropOffStationId = stationId)
    const studentsToDropOff = await this.prisma.tripAttendance.findMany({
      where: {
        tripId,
        status: AttendanceStatus.BOARDED,
        isActive: true,
        student: {
          studentTickets: {
            some: {
              routeId: trip.routeId,
              status: 'ACTIVE',
              isActive: true,
              dropOffStationId: stationId,
            },
          },
        },
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });

    return {
      message: `Lấy danh sách học sinh tại trạm "${routeStation.station.name}" thành công`,
      result: {
        station: {
          id: routeStation.station.id,
          name: routeStation.station.name,
          orderIndex: routeStation.orderIndex,
        },
        studentsToPickUp: studentsToPickUp.map((a) => ({
          attendanceId: a.id,
          status: a.status,
          student: a.student,
        })),
        studentsToDropOff: studentsToDropOff.map((a) => ({
          attendanceId: a.id,
          status: a.status,
          boardedAt: a.boardedAt,
          student: a.student,
        })),
      },
    };
  }

  /**
   * Tài xế quét QR vé → verify vé hợp lệ → tự động điểm danh BOARDED.
   * QR data format: { ticketId: string, timestamp: number }
   */
  async verifyTicketAndMarkAttendance(
    tripId: string,
    driverId: string,
    ticketId: string,
  ) {
    // 1. Xác minh tài xế được gán cho chuyến đi
    const trip = await this.verifyDriver(tripId, driverId);

    if (
      trip.status === TripStatus.COMPLETED ||
      trip.status === TripStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Không thể điểm danh. Chuyến đi đã ở trạng thái ${trip.status}`,
      );
    }

    // 2. Tìm vé theo ticketId
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        studentId: true,
        routeId: true,
        status: true,
        isActive: true,
        student: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Không tìm thấy vé với ID ${ticketId}`);
    }

    // 3. Kiểm tra vé hợp lệ
    if (ticket.status !== 'ACTIVE' || !ticket.isActive) {
      throw new BadRequestException('Vé không còn hiệu lực');
    }

    if (ticket.routeId !== trip.routeId) {
      throw new BadRequestException(
        'Vé không thuộc tuyến đường của chuyến đi này',
      );
    }

    // 4. Kiểm tra xem học sinh đã được điểm danh chưa
    const existingAttendance = await this.prisma.tripAttendance.findFirst({
      where: {
        tripId,
        studentId: ticket.studentId,
        isActive: true,
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

    if (
      existingAttendance &&
      (existingAttendance.status === AttendanceStatus.BOARDED ||
        existingAttendance.status === AttendanceStatus.ALIGHTED)
    ) {
      // Học sinh đã được điểm danh rồi → trả về thông tin kèm flag
      return {
        message: `Học sinh ${ticket.student?.fullName ?? 'N/A'} đã được điểm danh trước đó`,
        result: {
          ...existingAttendance,
          alreadyMarked: true,
          ticket: {
            id: ticket.id,
            routeId: ticket.routeId,
          },
        },
      };
    }

    // 5. Tự động điểm danh BOARDED
    const attendanceDto: AttendanceDto = {
      studentId: ticket.studentId,
      status: AttendanceStatus.BOARDED,
    };

    const result = await this.markAttendance(tripId, driverId, attendanceDto);

    return {
      message: `Điểm danh thành công cho học sinh ${ticket.student?.fullName ?? 'N/A'}`,
      result: {
        ...result,
        alreadyMarked: false,
        ticket: {
          id: ticket.id,
          routeId: ticket.routeId,
        },
      },
    };
  }

  /**
   * Lấy tổng hợp số HS cần đón/trả tại mỗi trạm trong chuyến đi.
   * Trả về map: { [stationId]: { pickUpCount, dropOffCount } }
   */
  async getStationSummary(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        routeId: true,
        route: {
          include: {
            routeStations: {
              orderBy: { orderIndex: 'asc' },
              include: { station: true },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Không tìm thấy chuyến đi với ID ${tripId}`);
    }

    // Lấy tất cả vé ACTIVE trên tuyến, kèm pickUpStationId và dropOffStationId
    const tickets = await this.prisma.ticket.findMany({
      where: {
        routeId: trip.routeId,
        status: 'ACTIVE',
        isActive: true,
      },
      select: {
        studentId: true,
        pickUpStationId: true,
        dropOffStationId: true,
      },
    });

    // Lấy danh sách studentId có trong TripAttendance PENDING (cần đón)
    const pendingAttendances = await this.prisma.tripAttendance.findMany({
      where: {
        tripId,
        status: AttendanceStatus.PENDING,
        isActive: true,
      },
      select: { studentId: true },
    });
    const pendingStudentIds = new Set(pendingAttendances.map((a) => a.studentId));

    // Lấy danh sách studentId đã BOARDED (cần trả)
    const boardedAttendances = await this.prisma.tripAttendance.findMany({
      where: {
        tripId,
        status: AttendanceStatus.BOARDED,
        isActive: true,
      },
      select: { studentId: true },
    });
    const boardedStudentIds = new Set(boardedAttendances.map((a) => a.studentId));

    // Tính toán số HS cần đón/trả tại mỗi trạm
    const summary: Record<string, { pickUpCount: number; dropOffCount: number }> = {};

    for (const rs of trip.route.routeStations) {
      const stationId = rs.stationId;
      let pickUpCount = 0;
      let dropOffCount = 0;

      for (const ticket of tickets) {
        if (ticket.pickUpStationId === stationId && pendingStudentIds.has(ticket.studentId)) {
          pickUpCount++;
        }
        if (ticket.dropOffStationId === stationId && boardedStudentIds.has(ticket.studentId)) {
          dropOffCount++;
        }
      }

      summary[stationId] = { pickUpCount, dropOffCount };
    }

    return {
      message: 'Lấy tổng hợp học sinh theo trạm thành công',
      result: summary,
    };
  }
}
