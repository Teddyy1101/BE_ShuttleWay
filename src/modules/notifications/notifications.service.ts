import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { FirebaseService } from '../../core/firebase/firebase.service';
import { NotificationGateway } from './notification.gateway';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { QueryAdminNotificationsDto } from './dto/query-admin-notifications.dto';
import { QueryGroupedNotificationsDto } from './dto/query-grouped-notifications.dto';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseService: FirebaseService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  /**
   * Broadcast thông báo cho nhóm người dùng (Admin only)
   * Lọc theo role, routeId (qua Ticket), tripId (qua TripAttendance)
   * Gửi FCM push + tạo bản ghi DB trong transaction
   */
  async broadcastNotification(dto: BroadcastNotificationDto) {
    const { title, body, targetRole, routeId, tripId } = dto;

    const where: Prisma.UserWhereInput = {
      isActive: true,
      isDeleted: false,
      role: { not: 'ADMIN' },
    };

    if (targetRole) {
      where.role = targetRole;
    }

    if (routeId) {
      where.studentTickets = {
        some: {
          routeId,
          status: 'ACTIVE',
        },
      };
    }

    if (tripId) {
      where.attendances = {
        some: {
          tripId,
          isActive: true,
        },
      };
    }

    const recipients = await this.prisma.user.findMany({
      where,
      select: { id: true, fcmToken: true, fullName: true },
    });

    if (recipients.length === 0) {
      return {
        message: 'Không tìm thấy người nhận nào phù hợp với bộ lọc',
        result: { totalRecipients: 0, fcmSentCount: 0 },
      };
    }

    const notificationData = recipients.map((user) => ({
      userId: user.id,
      title,
      body,
      isRead: false,
    }));

    await this.prisma.$transaction([
      this.prisma.notification.createMany({ data: notificationData }),
    ]);

    const fcmPromises = recipients
      .filter((user) => user.fcmToken)
      .map((user) =>
        this.firebaseService
          .sendNotification(user.fcmToken!, title, body)
          .catch((error) => {
            this.logger.error(
              `Lỗi gửi FCM cho user ${user.id}: ${error.message}`,
            );
            return false;
          }),
      );

    const fcmResults = await Promise.allSettled(fcmPromises);
    const fcmSentCount = fcmResults.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length;



    // Push real-time qua Socket.IO cho các user đang online
    recipients.forEach((user) => {
      this.notificationGateway.sendToUser(user.id, {
        title,
        body,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    });

    return {
      message: `Đã gửi thông báo cho ${recipients.length} người dùng`,
      result: {
        totalRecipients: recipients.length,
        fcmSentCount,
      },
    };
  }

  /**
   * Admin xem lịch sử tất cả thông báo đã gửi (phân trang + tìm kiếm)
   */
  async findAllAdmin(query: QueryAdminNotificationsDto) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      isActive: true,
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: {
          user: {
            select: { id: true, fullName: true, email: true, role: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      message: 'Lấy lịch sử thông báo thành công',
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
   * Admin xem lịch sử thông báo broadcast đã gửi (gom nhóm theo chiến dịch)
   * Chỉ lấy thông báo do Admin gửi hàng loạt (HAVING COUNT > 1)
   * Trả về: totalRecipients, readCount, targetRoles, latestSentAt
   */
  async findAllAdminGrouped(query: QueryGroupedNotificationsDto) {
    const { page = 1, limit = 10, search, fromDate, toDate } = query;
    const offset = (page - 1) * limit;

    // Xây dựng điều kiện WHERE động
    const conditions: string[] = ['n.is_active = true'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(n.title ILIKE $${paramIndex} OR n.body ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (fromDate) {
      conditions.push(`n.created_at >= $${paramIndex}::timestamptz`);
      params.push(fromDate);
      paramIndex++;
    }

    if (toDate) {
      // Thêm 1 ngày để bao gồm cả ngày kết thúc
      conditions.push(`n.created_at < ($${paramIndex}::date + interval '1 day')`);
      params.push(toDate);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Đếm tổng số chiến dịch broadcast (chỉ nhóm có > 1 người nhận)
    const countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT n.title, n.body FROM notifications n
        WHERE ${whereClause}
        GROUP BY n.title, n.body
        HAVING COUNT(*) > 1
      ) sub
    `;
    const countResult = await this.prisma.$queryRawUnsafe<{ total: bigint }[]>(countQuery, ...params);
    const total = Number(countResult[0]?.total || 0);

    // Lấy dữ liệu gom nhóm có phân trang, JOIN users để lấy vai trò đối tượng
    const dataQuery = `
      SELECT
        n.title,
        n.body,
        COUNT(*)::int AS "totalRecipients",
        SUM(CASE WHEN n.is_read = true THEN 1 ELSE 0 END)::int AS "readCount",
        array_agg(DISTINCT u.role) AS "targetRoles",
        MAX(n.created_at) AS "latestSentAt"
      FROM notifications n
      JOIN users u ON u.id = n.user_id
      WHERE ${whereClause}
      GROUP BY n.title, n.body
      HAVING COUNT(*) > 1
      ORDER BY MAX(n.created_at) DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const data = await this.prisma.$queryRawUnsafe<
      {
        title: string;
        body: string;
        totalRecipients: number;
        readCount: number;
        targetRoles: string[];
        latestSentAt: Date;
      }[]
    >(dataQuery, ...params, limit, offset);

    return {
      message: 'Lấy lịch sử thông báo broadcast thành công',
      result: {
        data,
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
      // Không có FCM token → bỏ qua push
    }

    // B4: Push real-time qua Socket.IO
    this.notificationGateway.sendToUser(userId, {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    });

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

    // B3: Gửi FCM Notification (hiện popup + rung trên thiết bị)
    if (user?.fcmToken) {
      try {
        await this.firebaseService.sendNotification(
          user.fcmToken,
          title,
          body,
        );
      } catch (error) {
        this.logger.error(
          `Lỗi gửi FCM notification cho user ${userId}: ${error.message}`,
        );
      }
    }

    // Push real-time qua Socket.IO
    this.notificationGateway.sendToUser(userId, {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    });

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

  // Xóa các thông báo cũ hơn 30 ngày (được gọi bởi CronService)
  async cleanupOldNotifications(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const { count } = await this.prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    return count;
  }
}
