import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lấy tổng quan thống kê cho Admin
   * Chạy song song tất cả các query bằng Promise.all
   */
  async getOverview() {
    // Xác định khoảng ngày hôm nay
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [revenueResult, activeStudents, todayTrips, activeBuses] =
      await Promise.all([
        // Tổng doanh thu từ các giao dịch thành công
        this.prisma.transaction.aggregate({
          _sum: { finalAmount: true },
          where: { status: 'SUCCESS', isActive: true },
        }),

        // Số học sinh đang hoạt động
        this.prisma.user.count({
          where: { role: 'STUDENT', isActive: true },
        }),

        // Số chuyến xe hôm nay
        this.prisma.trip.count({
          where: {
            scheduledDate: { gte: todayStart, lte: todayEnd },
            isActive: true,
          },
        }),

        // Số xe buýt đang hoạt động
        this.prisma.bus.count({
          where: { status: 'ACTIVE', isActive: true },
        }),
      ]);

    return {
      message: 'Lấy thống kê tổng quan thành công',
      result: {
        totalRevenue: revenueResult._sum.finalAmount || 0,
        activeStudents,
        todayTrips,
        activeBuses,
      },
    };
  }

  /**
   * Biểu đồ doanh thu theo khoảng thời gian
   * Nếu không truyền startDate/endDate thì mặc định 6 tháng gần nhất
   * Group by tháng, sum finalAmount từ Transaction SUCCESS
   */
  async getRevenueChart(startDate?: string, endDate?: string) {
    const months: { date: string; revenue: number }[] = [];

    let start: Date;
    let end: Date;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      // Đảm bảo start <= end
      if (start > end) {
        [start, end] = [end, start];
      }
    } else {
      // Mặc định: 6 tháng gần nhất
      end = new Date();
      start = new Date();
      start.setMonth(start.getMonth() - 5);
    }

    // Chuẩn hóa về đầu tháng start, cuối tháng end
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor <= lastMonth) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);

      const result = await this.prisma.transaction.aggregate({
        _sum: { finalAmount: true },
        where: {
          status: 'SUCCESS',
          isActive: true,
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      });

      const mm = (cursor.getMonth() + 1).toString().padStart(2, '0');
      const yyyy = cursor.getFullYear();

      months.push({
        date: `T${mm}/${yyyy}`,
        revenue: result._sum.finalAmount || 0,
      });

      // Tiến tới tháng tiếp theo
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return {
      message: 'Lấy biểu đồ doanh thu thành công',
      result: months,
    };
  }

  /**
   * Thống kê trạng thái chuyến đi (Tỷ lệ)
   */
  async getTripStats() {
    const result = await this.prisma.trip.groupBy({
      by: ['status'],
      where: { isActive: true },
      _count: { id: true },
    });

    return {
      message: 'Lấy thống kê trạng thái chuyến đi thành công',
      result: result.map((item) => ({
        status: item.status,
        count: item._count.id,
      })),
    };
  }

  /**
   * Top 5 tài xế có nhiều chuyến đi COMPLETED nhất
   */
  async getTopDrivers() {
    // Group by driverId, đếm số chuyến COMPLETED
    const topDriversRaw = await this.prisma.trip.groupBy({
      by: ['driverId'],
      where: {
        status: 'COMPLETED',
        isActive: true,
        driverId: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    // Lấy thông tin tài xế
    const driverIds = topDriversRaw
      .map((item) => item.driverId)
      .filter(Boolean) as string[];

    const drivers = await this.prisma.user.findMany({
      where: { id: { in: driverIds } },
      select: { id: true, fullName: true, avatarUrl: true },
    });

    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    const result = topDriversRaw.map((item) => {
      const driver = driverMap.get(item.driverId!);
      return {
        id: item.driverId,
        fullName: driver?.fullName || 'Không xác định',
        avatarUrl: driver?.avatarUrl || null,
        tripCount: item._count.id,
      };
    });

    return {
      message: 'Lấy top tài xế thành công',
      result,
    };
  }

  /**
   * Lấy 10 hoạt động gần đây nhất
   */
  async getRecentActivities() {
    // Lấy 5 vé mới nhất
    const recentTickets = await this.prisma.ticket.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { fullName: true } },
      }
    });

    // Lấy 5 yêu cầu hỗ trợ mới nhất
    const recentSupport = await this.prisma.supportTicket.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true } },
      }
    });

    const activities: any[] = [];

    recentTickets.forEach(ticket => {
      activities.push({
        id: ticket.id,
        type: 'TICKET',
        title: 'Mua vé mới',
        description: `Học sinh ${ticket.student?.fullName || 'ẩn danh'} vừa đăng ký vé.`,
        createdAt: ticket.createdAt,
      });
    });

    recentSupport.forEach(support => {
      activities.push({
        id: support.id,
        type: 'SUPPORT',
        title: support.title,
        description: `Yêu cầu hỗ trợ mới từ ${support.user?.fullName || support.guestName || 'Khách'}.`,
        createdAt: support.createdAt,
      });
    });

    // Sắp xếp giảm dần theo thời gian và lấy 10 cái đầu
    activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return {
      message: 'Lấy hoạt động gần đây thành công',
      result: activities.slice(0, 10),
    };
  }

  /**
   * Lấy 5 chuyến xe đang chạy
   */
  async getLiveTrips() {
    const trips = await this.prisma.trip.findMany({
      where: {
        status: 'IN_PROGRESS',
        isActive: true,
      },
      take: 5,
      orderBy: { startTime: 'desc' },
      include: {
        route: { select: { routeCode: true, name: true } },
        driver: { select: { fullName: true } },
        bus: { select: { licensePlate: true } },
      }
    });

    return {
      message: 'Lấy chuyến xe đang chạy thành công',
      result: trips,
    };
  }

  /**
   * Lấy thông báo cho Admin (Header Dropdown)
   */
  async getAdminNotifications() {
    // 5 Đơn xin nghỉ đang chờ duyệt
    const pendingLeaves = await this.prisma.leaveRequest.findMany({
      where: { status: 'PENDING' },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { 
          select: { 
            fullName: true, 
            avatarUrl: true, 
            studentTickets: { include: { route: true } } 
          } 
        },
        parent: { select: { fullName: true, phone: true } }
      }
    });

    // 5 Giao dịch mua vé thành công mới nhất
    const recentTransactions = await this.prisma.transaction.findMany({
      where: { status: 'SUCCESS' },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, phone: true } },
        ticket: { include: { route: true } },
        promotion: true,
      }
    });

    const notifications: any[] = [];

    pendingLeaves.forEach(leave => {
      notifications.push({
        id: leave.id,
        type: 'LEAVE_REQUEST',
        title: 'Đơn xin nghỉ phép mới',
        description: `Học sinh ${leave.student?.fullName || 'ẩn danh'} vừa gửi đơn xin nghỉ.`,
        createdAt: leave.createdAt,
        isRead: false, // Giả lập trạng thái chưa đọc
        payload: leave,
      });
    });

    recentTransactions.forEach(tx => {
      notifications.push({
        id: tx.id,
        type: 'PAYMENT_SUCCESS',
        title: 'Thanh toán thành công',
        description: `Khách hàng ${tx.user?.fullName || 'ẩn danh'} vừa mua ${tx.ticket?.ticketType === 'MONTHLY' ? 'Vé tháng' : 'Vé lượt'}.`,
        createdAt: tx.createdAt,
        isRead: false,
        payload: tx,
      });
    });

    // Sắp xếp giảm dần theo thời gian
    notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return {
      message: 'Lấy thông báo thành công',
      result: notifications,
    };
  }

  /**
   * Lấy số lượng công việc cần xử lý (Đơn nghỉ chưa duyệt + Yêu cầu hỗ trợ đang mở)
   */
  async getPendingTasks() {
    const [pendingLeaves, openSupport] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: { status: 'PENDING' },
      }),
      this.prisma.supportTicket.count({
        where: { status: 'OPEN' },
      }),
    ]);

    return {
      message: 'Lấy công việc cần xử lý thành công',
      result: {
        pendingLeaves,
        openSupport,
        total: pendingLeaves + openSupport,
      },
    };
  }

  /**
   * Top 5 tuyến đường phổ biến nhất (theo số lượng vé đã bán)
   */
  async getPopularRoutes() {
    const topRoutesRaw = await this.prisma.ticket.groupBy({
      by: ['routeId'],
      where: { isActive: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const routeIds = topRoutesRaw.map((item) => item.routeId);

    const routes = await this.prisma.route.findMany({
      where: { id: { in: routeIds } },
      select: { id: true, routeCode: true, name: true },
    });

    const routeMap = new Map(routes.map((r) => [r.id, r]));

    const result = topRoutesRaw.map((item) => {
      const route = routeMap.get(item.routeId);
      return {
        routeId: item.routeId,
        routeCode: route?.routeCode || 'N/A',
        name: route?.name || 'Không xác định',
        ticketCount: item._count.id,
      };
    });

    return {
      message: 'Lấy tuyến đường phổ biến thành công',
      result,
    };
  }

  /**
   * Thống kê tỷ lệ đúng giờ (Tất cả thời gian)
   * Trả về danh sách thống kê theo từng ngày để Frontend tự lọc
   * Dung sai: 15 phút
   */
  async getPunctualityStats() {
    const completedTrips = await this.prisma.trip.findMany({
      where: {
        status: 'COMPLETED',
        isActive: true,
        startTime: { not: null },
      },
      select: {
        id: true,
        startTime: true,
        scheduledDate: true,
        route: {
          select: { estimatedTime: true },
        },
      },
    });

    const TOLERANCE_MINUTES = 15;
    
    // Khởi tạo map để nhóm theo ngày (YYYY-MM-DD)
    const dailyStats = new Map<string, { onTime: number; late: number }>();

    for (const trip of completedTrips) {
      if (!trip.startTime || !trip.route?.estimatedTime) {
        continue;
      }

      // Format ngày thành YYYY-MM-DD
      const dateStr = trip.scheduledDate.toISOString().split('T')[0];
      
      if (!dailyStats.has(dateStr)) {
        dailyStats.set(dateStr, { onTime: 0, late: 0 });
      }

      const scheduled = new Date(trip.scheduledDate);
      const estTime = new Date(trip.route.estimatedTime);
      scheduled.setHours(estTime.getHours(), estTime.getMinutes(), 0, 0);

      const diffMs = trip.startTime.getTime() - scheduled.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      const stats = dailyStats.get(dateStr)!;
      if (diffMinutes <= TOLERANCE_MINUTES) {
        stats.onTime++;
      } else {
        stats.late++;
      }
    }

    // Chuyển Map thành Array và sắp xếp theo ngày tăng dần
    const result = Array.from(dailyStats.entries())
      .map(([date, stats]) => ({
        date,
        onTime: stats.onTime,
        late: stats.late,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      message: 'Lấy thống kê đúng giờ thành công',
      result,
    };
  }
}
