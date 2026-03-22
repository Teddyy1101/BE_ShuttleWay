import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { QuerySupportTicketsDto } from './dto/query-support-tickets.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { CreateTicketReplyDto } from './dto/create-ticket-reply.dto';

@Injectable()
export class SupportTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tạo phiếu yêu cầu hỗ trợ mới
   * Hỗ trợ 2 case: User từ App (có userId) và Khách vãng lai (có guestName + guestPhone)
   */
  async create(dto: CreateSupportTicketDto) {
    // Validate userId nếu có
    if (dto.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
      });
      if (!user) {
        throw new NotFoundException(`Không tìm thấy người dùng với ID ${dto.userId}`);
      }
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: dto.userId || null,
        guestName: dto.guestName || null,
        guestPhone: dto.guestPhone || null,
        guestEmail: dto.guestEmail || null,
        category: dto.category,
        title: dto.title,
        content: dto.content,
        // status mặc định là OPEN (đã define trong schema)
      },
      include: {
        user: dto.userId
          ? { select: { id: true, fullName: true, email: true, phone: true } }
          : false,
      },
    });

    return {
      message: 'Tạo phiếu yêu cầu hỗ trợ thành công',
      result: ticket,
    };
  }

  /**
   * Lấy danh sách phiếu yêu cầu hỗ trợ (Admin)
   * Hỗ trợ phân trang, lọc theo status và category
   */
  async findAll(query: QuerySupportTicketsDto) {
    const { status, category, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách phiếu hỗ trợ thành công',
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
   * Lấy chi tiết 1 phiếu yêu cầu hỗ trợ
   * Include mảng replies (lịch sử chat) sắp xếp theo thời gian cũ đến mới
   */
  async findOne(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, phone: true, avatarUrl: true },
        },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: { id: true, fullName: true, avatarUrl: true, role: true },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Không tìm thấy phiếu hỗ trợ với ID ${id}`);
    }

    return {
      message: 'Lấy chi tiết phiếu hỗ trợ thành công',
      result: ticket,
    };
  }

  /**
   * Admin cập nhật trạng thái phiếu hỗ trợ
   */
  async updateStatus(id: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new NotFoundException(`Không tìm thấy phiếu hỗ trợ với ID ${id}`);
    }

    const updatedTicket = await this.prisma.supportTicket.update({
      where: { id },
      data: { status: dto.status },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
      },
    });

    return {
      message: `Cập nhật trạng thái phiếu hỗ trợ thành ${dto.status} thành công`,
      result: updatedTicket,
    };
  }

  /**
   * Thêm câu trả lời vào phiếu hỗ trợ (Lưu vào bảng TicketReply)
   */
  async createReply(ticketId: string, dto: CreateTicketReplyDto) {
    // Kiểm tra phiếu hỗ trợ tồn tại
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Không tìm thấy phiếu hỗ trợ với ID ${ticketId}`);
    }

    // Validate senderId nếu có
    if (dto.senderId) {
      const sender = await this.prisma.user.findUnique({
        where: { id: dto.senderId },
      });
      if (!sender) {
        throw new NotFoundException(`Không tìm thấy người dùng với ID ${dto.senderId}`);
      }
    }

    const reply = await this.prisma.ticketReply.create({
      data: {
        ticketId,
        senderId: dto.senderId || null,
        content: dto.content,
      },
      include: {
        sender: {
          select: { id: true, fullName: true, avatarUrl: true, role: true },
        },
      },
    });

    return {
      message: 'Thêm câu trả lời thành công',
      result: reply,
    };
  }
}
