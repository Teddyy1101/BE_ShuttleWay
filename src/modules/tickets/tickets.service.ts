import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RoutesService } from '../routes/routes.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { Role, TicketType } from '../../../generated/prisma/client';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routesService: RoutesService,
  ) {}

  /**
   * Mua vé xe
   * - STUDENT: tự động gán studentId = currentUser.id, parentId = null
   * - PARENT: bắt buộc truyền studentId, kiểm tra quyền quản lý qua bảng parent_student
   */
  async buyTicket(currentUser: any, createTicketDto: CreateTicketDto) {
    const { routeId, ticketType } = createTicketDto;
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
    const route = await this.routesService.findOne(routeId);

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
      },
      include: {
        student: {
          select: { id: true, fullName: true, email: true },
        },
        parent: {
          select: { id: true, fullName: true, email: true },
        },
        route: {
          select: { id: true, name: true, direction: true },
        },
      },
    });

    return {
      message: 'Mua vé thành công',
      result: ticket,
    };
  }

  /**
   * Lấy danh sách vé của tôi (phân trang)
   * - STUDENT: tìm theo studentId
   * - PARENT: tìm theo parentId
   */
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
              direction: true,
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
