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
} from '@nestjs/common';
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
  constructor(private readonly transactionsService: TransactionsService) {}

  // ========================
  // WEBHOOK ENDPOINTS (PUBLIC - KHÔNG CẦN AUTH)
  // Đặt TRƯỚC các route có :id param để tránh match nhầm
  // ========================

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
  @ApiOperation({ summary: 'Webhook từ SePay (Public)' })
  sepayWebhook(@Body() body: Record<string, any>) {
    return this.transactionsService.handleSePayWebhook(body);
  }

  // ========================
  // PROTECTED ENDPOINTS (YÊU CẦU JWT)
  // ========================

  @Post('checkout')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Thanh toán vé xe (có thể áp mã khuyến mãi) (PARENT, STUDENT)' })
  checkout(
    @CurrentUser() currentUser: any,
    @Body() checkoutDto: CheckoutDto,
  ) {
    return this.transactionsService.checkout(currentUser, checkoutDto);
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

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật trạng thái thanh toán (SUCCESS/FAILED) (ADMIN)' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateTransactionStatusDto,
  ) {
    return this.transactionsService.updateStatus(id, updateStatusDto);
  }
}
