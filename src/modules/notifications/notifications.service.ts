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
   * Gửi thông báo đẩy FCM (hiện popup màn hình khóa + rung) và lưu lịch sử vào DB
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

    // B2: Luôn lưu lịch sử thông báo vào DB
    const notification = await this.prisma.notification.create({
      data: { userId, title, body },
    });

    // B3: Gửi FCM nếu có token (không throw lỗi ra ngoài)
    let fcmSent = false;
    if (user.fcmToken) {
      try {
        fcmSent = await this.firebaseService.sendNotification(
          user.fcmToken,
          title,
          body,
        );
      } catch (error) {
        this.logger.error(
          `Lỗi gửi FCM push cho user ${userId}: ${error.message}`,
        );
      }
    } else {
      this.logger.warn(
        `Người dùng ${userId} không có FCM token, bỏ qua gửi thông báo đẩy`,
      );
    }

    return {
      message: 'Gửi thông báo thành công',
      result: { notification, fcmSent },
    };
  }

  /**
   * Thông báo tĩnh lặng (Silent Push) - lưu DB + gửi FCM Data Message
   */
  async createInAppNotification(userId: string, title: string, body: string) {
    // B1: Lưu bản ghi vào DB
    const notification = await this.prisma.notification.create({
      data: { userId, title, body },
    });

    // B2: Truy vấn fcmToken của user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });

    // B3: Gửi FCM Data Message (silent push - không throw lỗi ra ngoài)
    if (user?.fcmToken) {
      try {
        await this.firebaseService.sendDataMessage(user.fcmToken, {
          type: 'SILENT_IN_APP',
          action: 'RELOAD_NOTIFICATIONS',
          title,
          body,
        });
      } catch (error) {
        this.logger.error(
          `Lỗi gửi FCM data message cho user ${userId}: ${error.message}`,
        );
      }
    }

    return notification;
  }

  // Lấy danh sách thông báo của user (phân trang, sắp xếp mới nhất lên đầu)
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

  // Đánh dấu một thông báo đã đọc (kiểm tra quyền sở hữu)
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

  // Đánh dấu tất cả thông báo của user thành đã đọc
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
