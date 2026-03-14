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
}
