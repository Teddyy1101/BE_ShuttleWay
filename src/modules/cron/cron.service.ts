import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Chạy lúc 00:00 mỗi ngày
   * Nhiệm vụ 1: Cập nhật vé hết hạn (ACTIVE → EXPIRED)
   * Nhiệm vụ 2: Vô hiệu hóa mã khuyến mãi hết hạn
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyTasks() {
    this.logger.log('Bắt đầu chạy tác vụ tự động hàng ngày...');

    await Promise.all([
      this.expireTickets(),
      this.deactivatePromotions(),
    ]);

    this.logger.log('Hoàn thành tác vụ tự động hàng ngày.');
  }

  /**
   * Nhiệm vụ 1: Cập nhật trạng thái vé hết hạn
   */
  private async expireTickets() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count } = await this.prisma.ticket.updateMany({
      where: {
        status: 'ACTIVE',
        validUntil: { lt: today },
      },
      data: { status: 'EXPIRED' },
    });

    this.logger.log(`Đã cập nhật ${count} vé hết hạn thành EXPIRED.`);
  }

  /**
   * Nhiệm vụ 2: Vô hiệu hóa mã khuyến mãi hết hạn
   */
  private async deactivatePromotions() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count } = await this.prisma.promotion.updateMany({
      where: {
        isActive: true,
        validUntil: { lt: today },
      },
      data: { isActive: false },
    });

    this.logger.log(`Đã vô hiệu hóa ${count} mã khuyến mãi hết hạn.`);
  }
}
