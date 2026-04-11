import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RoutesService } from '../routes/routes.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { AdminQueryTicketsDto } from './dto/admin-query-tickets.dto';
import { Role, TicketType, TicketStatus } from '../../../generated/prisma/client';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routesService: RoutesService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Mua vé xe
   * - Client chỉ gửi `selectedStationId` (trạm nhà của học sinh).
   */
  async buyTicket(currentUser: any, createTicketDto: CreateTicketDto) {
    const { routeId, ticketType, selectedStationId } = createTicketDto;
    let studentId: string;
    let parentId: string | null = null;

    if (currentUser.role === Role.STUDENT) {
      // Học sinh tự mua vé cho mình
      studentId = currentUser.id;
    } else if (currentUser.role === Role.PARENT) {
      // Phụ huynh mua vé cho con
      if (!createTicketDto.studentId) {
        throw new BadRequestException(
          'Phụ huynh phải cung cấp ID học sinh khi mua vé',
        );
      }
      studentId = createTicketDto.studentId;
      parentId = currentUser.id;

      // Kiểm tra học sinh có thuộc quyền quản lý của phụ huynh không
      const relation = await this.prisma.parentStudent.findUnique({
        where: {
          parentId_studentId: {
            parentId: currentUser.id,
            studentId,
          },
        },
      });

      if (!relation || !relation.isActive) {
        throw new ForbiddenException(
          'Học sinh không thuộc quyền quản lý của bạn',
        );
      }
    } else {
      throw new ForbiddenException('Bạn không có quyền mua vé');
    }

    // Kiểm tra tuyến đường tồn tại và lấy giá vé
    const route = await this.routesService.findById(routeId);
    if (!route) {
      throw new NotFoundException('Tuyến đường không tồn tại');
    }

    // Kiểm tra trạm nhà có thuộc tuyến đường không
    const selectedRouteStation = await this.prisma.routeStation.findUnique({
      where: {
        routeId_stationId: { routeId, stationId: selectedStationId },
      },
    });

    if (!selectedRouteStation) {
      throw new BadRequestException(
        'Trạm đón đã chọn không thuộc tuyến đường này',
      );
    }

    // Lấy trạm cuối cùng trên tuyến (trạm trường học)
    const schoolRouteStation = await this.prisma.routeStation.findFirst({
      where: { routeId },
      orderBy: { orderIndex: 'desc' },
    });

    if (!schoolRouteStation) {
      throw new BadRequestException(
        'Tuyến đường chưa có trạm nào',
      );
    }

    // Không cho phép chọn trạm đón trùng với trạm trường
    if (selectedStationId === schoolRouteStation.stationId) {
      throw new BadRequestException(
        'Không thể chọn trạm trường học làm trạm đón',
      );
    }

    // Chiều đi (Home → School): pickUp = trạm nhà, dropOff = trạm trường
    const pickUpStationId = selectedStationId;
    const dropOffStationId = schoolRouteStation.stationId;

    // Lấy giá vé tương ứng với loại vé
    const priceAtBuy =
      ticketType === TicketType.MONTHLY
        ? route.monthlyPrice
        : route.singlePrice;

    // Tính ngày hiệu lực
    const now = new Date();
    const validFrom = now;
    let validUntil: Date;

    if (ticketType === TicketType.MONTHLY) {
      // Vé tháng: hiệu lực 30 ngày
      validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + 30);
    } else {
      // Vé đơn: hiệu lực 1 ngày
      validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + 1);
    }

    const ticket = await this.prisma.ticket.create({
      data: {
        studentId,
        parentId,
        routeId,
        ticketType,
        priceAtBuy,
        validFrom,
        validUntil,
        pickUpStationId,
        dropOffStationId,
      },
      include: {
        student: {
          select: { id: true, fullName: true, email: true },
        },
        parent: {
          select: { id: true, fullName: true, email: true },
        },
        route: {
          select: { id: true, name: true },
        },
        pickUpStation: {
          select: { id: true, name: true, latitude: true, longitude: true },
        },
        dropOffStation: {
          select: { id: true, name: true, latitude: true, longitude: true },
        },
      },
    });

    // Gắn học sinh vào các chuyến đi tương lai đã được admin tạo sẵn
    this.insertStudentIntoFutureTrips(studentId, routeId, validFrom, validUntil)
      .catch((err) =>
        this.logger.error(
          `Lỗi gắn học sinh ${studentId} vào chuyến tương lai: ${err.message}`,
        ),
      );



    return {
      message: 'Mua vé thành công',
      result: ticket,
    };
  }

  /**
   * Gắn học sinh vào TripAttendance của các chuyến đi tương lai
   * đã được admin tạo sẵn trên tuyến.
   */
  private async insertStudentIntoFutureTrips(
    studentId: string,
    routeId: string,
    validFrom: Date,
    validUntil: Date,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Chỉ lấy trip từ hôm nay trở đi, trong thời hạn vé
    const startDate = today > validFrom ? today : validFrom;

    const futureTrips = await this.prisma.trip.findMany({
      where: {
        routeId,
        isActive: true,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        scheduledDate: {
          gte: startDate,
          lte: validUntil,
        },
      },
      select: { id: true },
    });

    if (futureTrips.length === 0) return;

    // Loại bỏ trip mà student đã có attendance (tránh duplicate)
    const existing = await this.prisma.tripAttendance.findMany({
      where: {
        studentId,
        tripId: { in: futureTrips.map((t) => t.id) },
      },
      select: { tripId: true },
    });
    const existingIds = new Set(existing.map((a) => a.tripId));

    const newData = futureTrips
      .filter((t) => !existingIds.has(t.id))
      .map((t) => ({
        tripId: t.id,
        studentId,
        status: 'PENDING' as const,
      }));

    if (newData.length > 0) {
      await this.prisma.tripAttendance.createMany({ data: newData });
    }
  }

  async findAllAdmin(query: AdminQueryTicketsDto) {
    const { status, ticketType, routeId, search, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    // Lọc theo loại vé
    if (ticketType) {
      where.ticketType = ticketType;
    }

    // Lọc theo tuyến đường
    if (routeId) {
      where.routeId = routeId;
    }

    // Tìm kiếm theo tên học sinh
    if (search) {
      where.student = {
        fullName: { contains: search, mode: 'insensitive' },
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: { id: true, fullName: true, phone: true, avatarUrl: true },
          },
          route: {
            select: { id: true, name: true },
          },
          parent: {
            select: { id: true, fullName: true, phone: true },
          },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách vé thành công',
      result: {
        data: items,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * [ADMIN] Hủy vé theo ID
   */
  async cancelTicket(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new NotFoundException(`Không tìm thấy vé với ID ${id}`);
    }

    if (ticket.status === TicketStatus.CANCELLED) {
      throw new BadRequestException('Vé này đã được hủy trước đó');
    }

    const updatedTicket = await this.prisma.ticket.update({
      where: { id },
      data: { status: TicketStatus.CANCELLED },
      include: {
        student: {
          select: { id: true, fullName: true },
        },
        route: {
          select: { id: true, name: true },
        },
        parent: {
          select: { id: true, fullName: true },
        },
      },
    });

    return {
      message: 'Hủy vé thành công',
      result: updatedTicket,
    };
  }

  async getMyTickets(currentUser: any, query: QueryTicketsDto) {
    const { ticketType, status, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      isActive: true,
    };

    if (currentUser.role === Role.STUDENT) {
      where.studentId = currentUser.id;
    } else {
      where.parentId = currentUser.id;
    }

    if (ticketType) where.ticketType = ticketType;
    if (status) where.status = status;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: { id: true, fullName: true, email: true, avatarUrl: true },
          },
          parent: {
            select: { id: true, fullName: true, email: true },
          },
          route: {
            select: {
              id: true,
              name: true,
              shiftType: true,
              singlePrice: true,
              monthlyPrice: true,
            },
          },
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách vé thành công',
      result: {
        data: items,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * [ADMIN] Lấy lịch sử điểm danh gần nhất của học sinh trên tuyến đường
   */
  async getAttendanceHistory(studentId: string, routeId: string) {
    // Kiểm tra học sinh tồn tại
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException(`Không tìm thấy học sinh với ID ${studentId}`);
    }

    // Lấy 5 bản ghi điểm danh gần nhất của học sinh trên các chuyến đi thuộc route
    const attendances = await this.prisma.tripAttendance.findMany({
      where: {
        studentId,
        isActive: true,
        trip: {
          routeId,
          isActive: true,
        },
      },
      orderBy: {
        trip: { scheduledDate: 'desc' },
      },
      take: 5,
      include: {
        trip: {
          select: {
            scheduledDate: true,
            direction: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    return {
      message: 'Lấy lịch sử điểm danh thành công',
      result: attendances,
    };
  }

  /**
   * Tìm vé theo ID (dùng nội bộ cho TransactionsService)
   */
  async findOne(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        student: {
          select: { id: true, fullName: true },
        },
        parent: {
          select: { id: true, fullName: true },
        },
        route: {
          select: { id: true, name: true, singlePrice: true, monthlyPrice: true },
        },
      },
    });
    if (!ticket) {
      throw new NotFoundException(`Không tìm thấy vé với ID ${id}`);
    }
    return ticket;
  }
}
