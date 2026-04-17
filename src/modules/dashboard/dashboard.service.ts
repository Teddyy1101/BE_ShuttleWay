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
   * Biểu đồ doanh thu 7 ngày gần nhất
   * Group by ngày, sum finalAmount từ Transaction SUCCESS
   */
  async getRevenueChart() {
    const days: { date: string; revenue: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

      const result = await this.prisma.transaction.aggregate({
        _sum: { finalAmount: true },
        where: {
          status: 'SUCCESS',
          isActive: true,
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      });

      const dd = date.getDate().toString().padStart(2, '0');
      const mm = (date.getMonth() + 1).toString().padStart(2, '0');

      days.push({
        date: `${dd}/${mm}`,
        revenue: result._sum.finalAmount || 0,
      });
    }

    return {
      message: 'Lấy biểu đồ doanh thu thành công',
      result: days,
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
}
