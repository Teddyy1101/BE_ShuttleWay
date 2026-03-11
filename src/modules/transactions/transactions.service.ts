import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { PromotionsService } from '../promotions/promotions.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { DiscountType, Role } from '../../../generated/prisma/client';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService,
    private readonly promotionsService: PromotionsService,
  ) {}

  /**
   * Thanh toán vé (có thể áp mã khuyến mãi)
   * - PARENT: kiểm tra ticket.parentId === currentUser.id, gán parentId = currentUser.id
   * - STUDENT: kiểm tra ticket.studentId === currentUser.id, parentId = null
   * Sử dụng prisma.$transaction để đảm bảo tính toàn vẹn dữ liệu
   */
  async checkout(currentUser: any, checkoutDto: CheckoutDto) {
    const { ticketId, paymentMethod, promotionCode } = checkoutDto;

    // Kiểm tra vé tồn tại
    const ticket = await this.ticketsService.findOne(ticketId);

    // Kiểm tra quyền sở hữu vé
    if (currentUser.role === Role.STUDENT) {
      if (ticket.studentId !== currentUser.id) {
        throw new ForbiddenException('Vé này không thuộc về bạn');
      }
    } else if (currentUser.role === Role.PARENT) {
      if (ticket.parentId !== currentUser.id) {
        throw new ForbiddenException('Vé này không thuộc về bạn');
      }
    } else {
      throw new ForbiddenException('Bạn không có quyền thanh toán');
    }

    // Gán parentId theo role
    const parentId = currentUser.role === Role.PARENT ? currentUser.id : null;

    const totalAmount = ticket.priceAtBuy;
    let discountAmount = 0;
    let promotionId: string | null = null;

    // Nếu có promotionCode, kiểm tra tính hợp lệ và tính giảm giá
    if (promotionCode) {
      const promotion =
        await this.promotionsService.findValidByCode(promotionCode);

      promotionId = promotion.id;

      if (promotion.discountType === DiscountType.PERCENTAGE) {
        discountAmount = (totalAmount * promotion.discountValue) / 100;
      } else {
        // FIXED
        discountAmount = promotion.discountValue;
      }

      // Đảm bảo giảm giá không vượt quá tổng tiền
      if (discountAmount > totalAmount) {
        discountAmount = totalAmount;
      }
    }

    const finalAmount = totalAmount - discountAmount;

    // Sử dụng $transaction để thực hiện 2 việc cùng lúc
    const transaction = await this.prisma.$transaction(async (tx) => {
      // 1. Tạo bản ghi Transaction (trạng thái PENDING)
      const newTransaction = await tx.transaction.create({
        data: {
          ticketId,
          parentId,
          promotionId,
          totalAmount,
          discountAmount,
          finalAmount,
          paymentMethod,
          // status mặc định là PENDING (từ schema)
        },
        include: {
          ticket: {
            select: {
              id: true,
              ticketType: true,
              priceAtBuy: true,
              student: { select: { id: true, fullName: true } },
              route: { select: { id: true, name: true } },
            },
          },
          promotion: {
            select: { id: true, code: true, discountType: true, discountValue: true },
          },
        },
      });

      // 2. Tăng usedCount của Promotion lên 1 (nếu có áp mã)
      if (promotionId) {
        await tx.promotion.update({
          where: { id: promotionId },
          data: { usedCount: { increment: 1 } },
        });
      }

      return newTransaction;
    });

    return {
      message: 'Tạo giao dịch thanh toán thành công',
      result: transaction,
    };
  }

  /**
   * Cập nhật trạng thái thanh toán (Admin hoặc Webhook)
   */
  async updateStatus(
    id: string,
    updateStatusDto: UpdateTransactionStatusDto,
  ) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Không tìm thấy giao dịch với ID ${id}`);
    }

    if (transaction.status !== 'PENDING') {
      throw new BadRequestException(
        'Chỉ có thể cập nhật trạng thái cho giao dịch đang ở trạng thái PENDING',
      );
    }

    return this.prisma.transaction.update({
      where: { id },
      data: { status: updateStatusDto.status },
      include: {
        ticket: {
          select: { id: true, ticketType: true, priceAtBuy: true },
        },
        parent: {
          select: { id: true, fullName: true, email: true },
        },
        promotion: {
          select: { id: true, code: true },
        },
      },
    });
  }

  /**
   * Lấy danh sách giao dịch (Admin)
   */
  async findAll(query: QueryTransactionsDto) {
    const { status, paymentMethod, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ticket: {
            select: {
              id: true,
              ticketType: true,
              priceAtBuy: true,
              student: { select: { id: true, fullName: true } },
              route: { select: { id: true, name: true } },
            },
          },
          parent: {
            select: { id: true, fullName: true, email: true },
          },
          promotion: {
            select: { id: true, code: true, discountType: true, discountValue: true },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách giao dịch thành công',
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
   * Lấy lịch sử giao dịch cá nhân
   * - PARENT: lọc theo parentId
   * - STUDENT: lọc theo ticket.studentId (relation filter)
   */
  async getMyTransactions(currentUser: any, query: QueryTransactionsDto) {
    const { status, paymentMethod, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };

    if (currentUser.role === Role.STUDENT) {
      // Lọc giao dịch mà vé thuộc về học sinh này
      where.ticket = { studentId: currentUser.id };
    } else {
      where.parentId = currentUser.id;
    }

    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ticket: {
            select: {
              id: true,
              ticketType: true,
              priceAtBuy: true,
              student: { select: { id: true, fullName: true } },
              route: { select: { id: true, name: true } },
            },
          },
          promotion: {
            select: { id: true, code: true, discountType: true, discountValue: true },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      message: 'Lấy lịch sử giao dịch thành công',
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
}
