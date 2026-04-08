import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Query,
  Req,
  Ip,
  HttpCode,
  HttpStatus,
  Res,
  Headers,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '../../../generated/prisma/client';
import { Request } from 'express';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name);

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly configService: ConfigService,
  ) {}

  // WEBHOOK ENDPOINTS (PUBLIC - KHÔNG CẦN AUTH)
  @Public()
  @Get('webhook/vnpay-ipn')
  @ApiOperation({ summary: 'Webhook IPN từ VNPay (Public)' })
  vnpayIpn(@Query() query: Record<string, string>) {
    return this.transactionsService.verifyVnPayIpn(query);
  }

  @Public()
  @Post('webhook/momo-ipn')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Webhook IPN từ MoMo (Public)' })
  async momoIpn(@Body() body: Record<string, any>) {
    await this.transactionsService.verifyMoMoIpn(body);
  }

  @Public()
  @Post('webhook/sepay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook từ SePay (Public)' })
  sepayWebhook(
    @Body() body: Record<string, any>,
    @Headers('authorization') authHeader: string,
  ) {
    // Log token để debug (chỉ warning, không block)
    const expectedToken = this.configService.get<string>('SEPAY_WEBHOOK_TOKEN');
    if (expectedToken && authHeader) {
      // SePay có thể gửi: "Apikey TOKEN", "Bearer TOKEN", hoặc chỉ "TOKEN"
      const token = authHeader
        .replace(/^(Bearer|Apikey)\s+/i, '')
        .trim();
      if (token !== expectedToken) {
        this.logger.warn(
          `SePay Webhook: Token không khớp (received: ${token?.substring(0, 10)}...)`,
        );
      }
    }

    return this.transactionsService.handleSePayWebhook(body);
  }

  // PROTECTED ENDPOINTS (YÊU CẦU JWT)

  @Post('checkout')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Thanh toán vé xe (có thể áp mã khuyến mãi) (PARENT, STUDENT)' })
  checkout(
    @CurrentUser() currentUser: any,
    @Body() checkoutDto: CheckoutDto,
  ) {
    return this.transactionsService.checkout(currentUser, checkoutDto);
  }

  @Get('stats')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Thống kê dòng tiền (tổng doanh thu) (ADMIN)' })
  getStats() {
    return this.transactionsService.getStats();
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách tất cả giao dịch (phân trang, lọc) (ADMIN)' })
  findAll(@Query() query: QueryTransactionsDto) {
    return this.transactionsService.findAll(query);
  }

  @Get('my-transactions')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy lịch sử giao dịch của tôi (PARENT, STUDENT)' })
  getMyTransactions(
    @CurrentUser() currentUser: any,
    @Query() query: QueryTransactionsDto,
  ) {
    return this.transactionsService.getMyTransactions(currentUser, query);
  }

  @Get(':id/vnpay-url')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy link thanh toán VNPay (PARENT, STUDENT)' })
  getVnPayUrl(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    // Lấy IP client từ headers (hỗ trợ proxy) hoặc từ connection
    const ipAddr =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    return this.transactionsService.createVnPayUrl(id, ipAddr);
  }

  @Get(':id/momo-url')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy link thanh toán MoMo (PARENT, STUDENT)' })
  getMoMoUrl(@Param('id') id: string) {
    return this.transactionsService.createMoMoUrl(id);
  }

  @Get(':id/status')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Kiểm tra trạng thái giao dịch (polling SePay) (PARENT, STUDENT)' })
  getTransactionStatus(@Param('id') id: string) {
    return this.transactionsService.getTransactionStatus(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật trạng thái thanh toán (SUCCESS/FAILED) (ADMIN)' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateTransactionStatusDto,
  ) {
    return this.transactionsService.updateStatus(id, updateStatusDto);
  }

  @Public()
  @Get('vnpay/return')
  @ApiOperation({ summary: 'Trang đích sau khi thanh toán VNPay xong (Return URL)' })
  async vnpayReturn(@Query() query: Record<string, string>, @Res() res: any) {
    // Cập nhật trạng thái giao dịch trong DB dựa trên kết quả VNPay trả về
    // Điều này đảm bảo DB được cập nhật ngay cả khi IPN callback không đến được server
    try {
      await this.transactionsService.verifyVnPayIpn(query);
    } catch (error) {
      // Log lỗi nhưng vẫn hiển thị trang kết quả cho người dùng
      console.error('Lỗi khi xác thực VNPay return:', error?.message);
    }

    // Nhận kết quả từ VNPAY trả về trên thanh URL (query parameters)
    const isSuccess = query.vnp_ResponseCode === '00';
    
    // Trả về một mã HTML đơn giản để App Flutter nhận diện
    if (isSuccess) {
      return res.send(`
        <html>
          <body style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: sans-serif;">
            <h2 style="color: green;">✅ Thanh toán thành công!</h2>
            <p>Bạn có thể đóng cửa sổ này để quay lại App SafeWheels.</p>
          </body>
        </html>
      `);
    } else {
      return res.send(`
        <html>
          <body style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: sans-serif;">
            <h2 style="color: red;">❌ Thanh toán thất bại hoặc đã hủy!</h2>
            <p>Vui lòng đóng cửa sổ này và thử lại.</p>
          </body>
        </html>
      `);
    }
  }

  @Public()
  @Get('momo/return')
  @ApiOperation({ summary: 'Trang đích sau khi thanh toán MoMo xong (Return URL)' })
  async momoReturn(@Query() query: Record<string, string>, @Res() res: any) {
    // resultCode === '0' nghĩa là thành công (MoMo trả về dạng string trên query)
    const isSuccess = query.resultCode === '0';

    if (isSuccess) {
      return res.send(`
        <html>
          <body style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: sans-serif;">
            <h2 style="color: green;">✅ Thanh toán thành công!</h2>
            <p>Bạn có thể đóng cửa sổ này để quay lại App SafeWheels.</p>
          </body>
        </html>
      `);
    } else {
      return res.send(`
        <html>
          <body style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: sans-serif;">
            <h2 style="color: red;">❌ Thanh toán thất bại hoặc đã hủy!</h2>
            <p>Vui lòng đóng cửa sổ này và thử lại.</p>
          </body>
        </html>
      `);
    }
  }
}
