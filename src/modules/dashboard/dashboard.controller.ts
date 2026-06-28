import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../../generated/prisma/client';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Lấy thống kê tổng quan hệ thống (ADMIN)' })
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('revenue-chart')
  @ApiOperation({ summary: 'Biểu đồ doanh thu theo khoảng thời gian (ADMIN)' })
  getRevenueChart(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.dashboardService.getRevenueChart(startDate, endDate);
  }

  @Get('trip-stats')
  @ApiOperation({ summary: 'Thống kê trạng thái chuyến đi (ADMIN)' })
  getTripStats() {
    return this.dashboardService.getTripStats();
  }

  @Get('top-drivers')
  @ApiOperation({ summary: 'Top 5 tài xế có nhiều chuyến đi nhất (ADMIN)' })
  getTopDrivers() {
    return this.dashboardService.getTopDrivers();
  }

  @Get('recent-activities')
  @ApiOperation({ summary: 'Hoạt động gần đây (ADMIN)' })
  getRecentActivities() {
    return this.dashboardService.getRecentActivities();
  }

  @Get('live-trips')
  @ApiOperation({ summary: 'Chuyến xe đang chạy (ADMIN)' })
  getLiveTrips() {
    return this.dashboardService.getLiveTrips();
  }

  @Get('admin-notifications')
  @ApiOperation({ summary: 'Thông báo trên Header (ADMIN)' })
  getAdminNotifications() {
    return this.dashboardService.getAdminNotifications();
  }

  @Get('pending-tasks')
  @ApiOperation({ summary: 'Số lượng công việc cần xử lý (ADMIN)' })
  getPendingTasks() {
    return this.dashboardService.getPendingTasks();
  }

  @Get('popular-routes')
  @ApiOperation({ summary: 'Top 5 tuyến đường phổ biến nhất (ADMIN)' })
  getPopularRoutes() {
    return this.dashboardService.getPopularRoutes();
  }

  @Get('punctuality')
  @ApiOperation({ summary: 'Thống kê tỷ lệ đúng giờ 30 ngày (ADMIN)' })
  getPunctualityStats() {
    return this.dashboardService.getPunctualityStats();
  }
}
