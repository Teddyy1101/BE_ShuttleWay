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
   * Biểu đồ doanh thu 6 tháng gần nhất
   * Group by tháng, sum finalAmount từ Transaction SUCCESS
   */
  async getRevenueChart() {
    const months: { date: string; revenue: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

      const result = await this.prisma.transaction.aggregate({
        _sum: { finalAmount: true },
        where: {
          status: 'SUCCESS',
          isActive: true,
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      });

      const mm = (date.getMonth() + 1).toString().padStart(2, '0');
      const yyyy = date.getFullYear();

      months.push({
        date: `T${mm}/${yyyy}`,
        revenue: result._sum.finalAmount || 0,
      });
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
}
