import { Controller, Get, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Biểu đồ doanh thu 7 ngày gần nhất (ADMIN)' })
  getRevenueChart() {
    return this.dashboardService.getRevenueChart();
  }

  @Get('top-drivers')
  @ApiOperation({ summary: 'Top 5 tài xế có nhiều chuyến đi nhất (ADMIN)' })
  getTopDrivers() {
    return this.dashboardService.getTopDrivers();
  }
}
