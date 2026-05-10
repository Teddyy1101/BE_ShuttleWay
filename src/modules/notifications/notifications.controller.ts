import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { QueryAdminNotificationsDto } from './dto/query-admin-notifications.dto';
import { QueryGroupedNotificationsDto } from './dto/query-grouped-notifications.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../../generated/prisma/enums';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('broadcast')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Gửi thông báo hàng loạt cho nhóm người dùng (Admin only)' })
  broadcast(@Body() dto: BroadcastNotificationDto) {
    return this.notificationsService.broadcastNotification(dto);
  }

  @Get('admin/history')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xem lịch sử tất cả thông báo đã gửi (Admin only, phân trang)' })
  findAllAdmin(@Query() query: QueryAdminNotificationsDto) {
    return this.notificationsService.findAllAdmin(query);
  }

  @Get('admin/history/grouped')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xem lịch sử thông báo gom nhóm theo chiến dịch (Admin only)' })
  findAllAdminGrouped(@Query() query: QueryGroupedNotificationsDto) {
    return this.notificationsService.findAllAdminGrouped(query);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của người đang đăng nhập (phân trang)' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.findAll(userId, query);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo đã đọc' })
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu một thông báo đã đọc' })
  @ApiParam({ name: 'id', description: 'UUID của thông báo' })
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.markAsRead(id, userId);
  }

  @Delete('delete-all')
  @ApiOperation({ summary: 'Xóa tất cả thông báo của người đang đăng nhập' })
  deleteAll(@CurrentUser('id') userId: string) {
    return this.notificationsService.deleteAllByUser(userId);
  }
}
