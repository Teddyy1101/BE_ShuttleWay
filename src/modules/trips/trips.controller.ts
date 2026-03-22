import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { QueryTripsDto } from './dto/query-trips.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { AttendanceDto } from './dto/attendance.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../../generated/prisma/client';

@ApiTags('Trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  // ========================
  // API cho ADMIN
  // ========================

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo chuyến đi mới (Chỉ dành cho ADMIN)' })
  create(@Body() createTripDto: CreateTripDto) {
    return this.tripsService.create(createTripDto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách chuyến đi (Lọc theo status, ngày, tuyến đường) (ADMIN)' })
  findAll(@Query() query: QueryTripsDto) {
    return this.tripsService.findAll(query);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật thông tin chuyến đi (Chỉ dành cho ADMIN)' })
  update(@Param('id') id: string, @Body() updateTripDto: UpdateTripDto) {
    return this.tripsService.update(id, updateTripDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa chuyến đi (Xóa mềm - đặt isActive thành false) (ADMIN)' })
  remove(@Param('id') id: string) {
    return this.tripsService.remove(id);
  }

  @Get(':id/detail')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy chi tiết chuyến đi kèm danh sách điểm danh (ADMIN)' })
  getDetail(@Param('id') id: string) {
    return this.tripsService.findOneWithAttendances(id);
  }

  @Patch(':id/admin-attendance')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin điểm danh thủ công cho học sinh (ADMIN)' })
  adminMarkAttendance(
    @Param('id') id: string,
    @Body() attendanceDto: AttendanceDto,
  ) {
    return this.tripsService.adminMarkAttendance(id, attendanceDto);
  }

  @Patch(':id/admin-complete')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin kết thúc chuyến đi thủ công (ADMIN)' })
  adminCompleteTrip(@Param('id') id: string) {
    return this.tripsService.adminCompleteTrip(id);
  }

  @Patch(':id/admin-cancel')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin hủy chuyến đi đột xuất (ADMIN)' })
  adminCancelTrip(@Param('id') id: string) {
    return this.tripsService.adminCancelTrip(id);
  }

  // ========================
  // API cho DRIVER
  // ========================

  @Patch(':id/start')
  @Roles(Role.DRIVER)
  @ApiOperation({ summary: 'Bắt đầu chuyến đi - chuyển trạng thái sang IN_PROGRESS (DRIVER)' })
  startTrip(@Param('id') id: string, @CurrentUser('id') driverId: string) {
    return this.tripsService.startTrip(id, driverId);
  }

  @Patch(':id/station')
  @Roles(Role.DRIVER)
  @ApiOperation({ summary: 'Cập nhật trạm hiện tại của chuyến đi (DRIVER)' })
  updateStation(
    @Param('id') id: string,
    @CurrentUser('id') driverId: string,
    @Body() updateStationDto: UpdateStationDto,
  ) {
    return this.tripsService.updateStation(id, driverId, updateStationDto);
  }

  @Patch(':id/complete')
  @Roles(Role.DRIVER)
  @ApiOperation({ summary: 'Hoàn thành chuyến đi - chuyển trạng thái sang COMPLETED (DRIVER)' })
  completeTrip(@Param('id') id: string, @CurrentUser('id') driverId: string) {
    return this.tripsService.completeTrip(id, driverId);
  }

  @Post(':id/attendance')
  @Roles(Role.DRIVER)
  @ApiOperation({ summary: 'Điểm danh học sinh (Upsert: có thì cập nhật, chưa có thì tạo mới) (DRIVER)' })
  markAttendance(
    @Param('id') id: string,
    @CurrentUser('id') driverId: string,
    @Body() attendanceDto: AttendanceDto,
  ) {
    return this.tripsService.markAttendance(id, driverId, attendanceDto);
  }

  // ========================
  // API cho PARENT / STUDENT
  // ========================

  @Get(':id/tracking')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Xem chi tiết tracking chuyến đi (thông tin xe, tài xế, tuyến đường, trạm, điểm danh) (PARENT, STUDENT)' })
  getTracking(@Param('id') id: string) {
    return this.tripsService.getTracking(id);
  }

  // ========================
  // API GIẢI LẬP (SIMULATOR)
  // ========================

  @Post(':id/simulate')
  @Roles(Role.DRIVER, Role.ADMIN)
  @ApiOperation({ summary: 'Giả lập chuyến đi - phát tọa độ mô phỏng qua WebSocket (DRIVER, ADMIN)' })
  simulateTrip(@Param('id') id: string) {
    return this.tripsService.simulateTrip(id);
  }
}
