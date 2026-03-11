import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lấy lịch sử chat giữa 2 người, phân trang, mới nhất lên đầu
   */
  async getChatHistory(
    userId: string,
    partnerId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const where = {
      isActive: true,
      OR: [
        { senderId: userId, receiverId: partnerId },
        { senderId: partnerId, receiverId: userId },
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          sender: {
            select: { id: true, fullName: true, avatarUrl: true },
          },
          receiver: {
            select: { id: true, fullName: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Tạo tin nhắn mới và trả về kèm thông tin sender/receiver
   */
  async createMessage(senderId: string, receiverId: string, content: string) {
    return this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
      },
      include: {
        sender: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        receiver: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
    });
  }
}
