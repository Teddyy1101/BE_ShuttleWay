import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FirebaseService } from '../../core/firebase/firebase.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseService: FirebaseService,
  ) {}

  /**
   * Gửi thông báo đẩy FCM và lưu lịch sử vào DB
   * B1: Truy vấn fcmToken của user
   * B2: Nếu có token → gửi FCM
   * B3: Luôn lưu thông báo vào DB dù gửi thành công hay thất bại
   */
  async sendPushNotification(userId: string, title: string, body: string) {
    // B1: Truy vấn fcmToken
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fcmToken: true },
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    // B2: Gửi FCM nếu có token
    let fcmSent = false;
    if (user.fcmToken) {
      fcmSent = await this.firebaseService.sendNotification(
        user.fcmToken,
        title,
        body,
      );
    } else {
      this.logger.warn(
        `Người dùng ${userId} không có FCM token, bỏ qua gửi thông báo đẩy`,
      );
    }

    // B3: Luôn lưu lịch sử thông báo vào DB
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        body,
      },
    });

    return {
      message: 'Gửi thông báo thành công',
      result: {
        notification,
        fcmSent,
      },
    };
  }

  /**
   * Chỉ lưu thông báo vào DB (hiện trong app), KHÔNG gọi Firebase FCM
   */
  async createInAppNotification(userId: string, title: string, body: string) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        body,
      },
    });

    return notification;
  }

  /**
   * Lấy danh sách thông báo của user (phân trang, sắp xếp mới nhất lên đầu)
   */
  async findAll(userId: string, query: QueryNotificationsDto) {
    const { page = 1, limit = 20, isRead } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      isActive: true,
      ...(isRead !== undefined && { isRead }),
    };

    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách thông báo thành công',
      result: {
        data: notifications,
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
   * Đánh dấu một thông báo đã đọc (kiểm tra quyền sở hữu)
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId, isActive: true },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return {
      message: 'Đánh dấu thông báo đã đọc thành công',
      result: updated,
    };
  }

  /**
   * Đánh dấu tất cả thông báo của user thành đã đọc
   */
  async markAllAsRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, isRead: false, isActive: true },
      data: { isRead: true },
    });

    return {
      message: `Đã đánh dấu ${count} thông báo là đã đọc`,
    };
  }
}
