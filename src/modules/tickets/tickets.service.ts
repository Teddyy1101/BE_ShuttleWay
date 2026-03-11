import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RoutesService } from '../routes/routes.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { TicketType } from '../../../generated/prisma/client';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routesService: RoutesService,
  ) {}

  /**
   * Phụ huynh mua vé cho học sinh
   */
  async buyTicket(parentId: string, createTicketDto: CreateTicketDto) {
    const { studentId, routeId, ticketType } = createTicketDto;

    // Kiểm tra tuyến đường tồn tại và lấy giá vé
    const route = await this.routesService.findOne(routeId);

    // Lấy giá vé tương ứng với loại vé
    const priceAtBuy =
      ticketType === TicketType.MONTHLY
        ? route.monthlyPrice
        : route.singlePrice;

    // Tính ngày hiệu lực
    const now = new Date();
    let validFrom = now;
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

    return this.prisma.ticket.create({
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
        route: {
          select: { id: true, name: true, direction: true },
        },
      },
    });
  }

  /**
   * Lấy danh sách vé của phụ huynh (phân trang)
   */
  async getMyTickets(parentId: string, query: QueryTicketsDto) {
    const { ticketType, status, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      parentId,
      isActive: true,
    };
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
