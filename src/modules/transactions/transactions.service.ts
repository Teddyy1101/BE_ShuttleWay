import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { PromotionsService } from '../promotions/promotions.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { DiscountType, Role } from '../../../generated/prisma/client';
import * as crypto from 'crypto';
import axios from 'axios';
import * as moment from 'moment';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService,
    private readonly promotionsService: PromotionsService,
    private readonly configService: ConfigService,
  ) {}


  /**
   * Tạo URL thanh toán VNPay
   * Sort tham số theo alphabet, ký HMAC SHA512
   */
  async createVnPayUrl(transactionId: string, ipAddr: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Không tìm thấy giao dịch với ID ${transactionId}`);
    }

    if (transaction.status !== 'PENDING') {
      throw new BadRequestException('Chỉ có thể tạo link thanh toán cho giao dịch đang ở trạng thái PENDING');
    }

    const vnpTmnCode = this.configService.get<string>('VNP_TMN_CODE')!;
    const vnpHashSecret = this.configService.get<string>('VNP_HASH_SECRET')!;
    const vnpUrl = this.configService.get<string>('VNP_URL')!;
    const vnpReturnUrl = this.configService.get<string>('VNP_RETURN_URL')!;

    const createDate = moment().format('YYYYMMDDHHmmss');
    const orderId = transactionId;
    const amount = Math.round(transaction.finalAmount * 100); // VNPay yêu cầu nhân 100

    const vnpParams: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: vnpTmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderId,
      vnp_OrderInfo: `Thanh toan ve xe - ${orderId}`,
      vnp_OrderType: 'other',
      vnp_Amount: amount.toString(),
      vnp_ReturnUrl: vnpReturnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate,
    };

    const sortedKeys = Object.keys(vnpParams).sort();
    const queryString = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(vnpParams[key])}`)
      .join('&');

    // Tạo chữ ký HMAC SHA512
    const hmac = crypto.createHmac('sha512', vnpHashSecret);
    const signed = hmac.update(Buffer.from(queryString, 'utf-8')).digest('hex');

    const paymentUrl = `${vnpUrl}?${queryString}&vnp_SecureHash=${signed}`;

    return {
      message: 'Tạo link thanh toán VNPay thành công',
      result: { paymentUrl },
    };
  }

  /**
   * Tạo URL thanh toán MoMo
   * Ký HMAC SHA256, gọi API MoMo qua axios
   */
  async createMoMoUrl(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Không tìm thấy giao dịch với ID ${transactionId}`);
    }

    if (transaction.status !== 'PENDING') {
      throw new BadRequestException('Chỉ có thể tạo link thanh toán cho giao dịch đang ở trạng thái PENDING');
    }

    const partnerCode = this.configService.get<string>('MOMO_PARTNER_CODE');
    const accessKey = this.configService.get<string>('MOMO_ACCESS_KEY');
    const secretKey = this.configService.get<string>('MOMO_SECRET_KEY')!;
    const momoEndpoint = this.configService.get<string>('MOMO_ENDPOINT')!;
    const redirectUrl = this.configService.get<string>('MOMO_REDIRECT_URL');
    const ipnUrl = this.configService.get<string>('MOMO_IPN_URL');

    const orderId = `${transactionId}-${Date.now()}`;
    const requestId = orderId;
    const amount = Math.round(transaction.finalAmount).toString();
    const orderInfo = `Thanh toan ve xe - ${transactionId}`;
    const requestType = 'payWithMethod';
    const extraData = '';

    // Tạo rawSignature theo thứ tự của MoMo
    const rawSignature = [
      `accessKey=${accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `ipnUrl=${ipnUrl}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `partnerCode=${partnerCode}`,
      `redirectUrl=${redirectUrl}`,
      `requestId=${requestId}`,
      `requestType=${requestType}`,
    ].join('&');

    // Ký HMAC SHA256
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(rawSignature)
      .digest('hex');

    const requestBody = {
      partnerCode,
      partnerName: 'Hệ thống xe buýt trường học',
      storeId: partnerCode,
      requestId,
      amount: parseInt(amount),
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      lang: 'vi',
      requestType,
      autoCapture: true,
      extraData,
      signature,
    };

    try {
      const response = await axios.post(momoEndpoint, requestBody);

      if (response.data && response.data.payUrl) {
        return {
          message: 'Tạo link thanh toán MoMo thành công',
          result: { paymentUrl: response.data.payUrl },
        };
      }

      throw new BadRequestException(
        `MoMo trả về lỗi: ${response.data?.message || 'Không xác định'}`,
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Lỗi khi gọi API MoMo', error?.message);
      throw new InternalServerErrorException('Không thể kết nối đến cổng thanh toán MoMo');
    }
  }

  /**
   * Xác thực IPN từ VNPay
   * Băm lại chữ ký, so khớp, cập nhật trạng thái giao dịch
   */
  async verifyVnPayIpn(query: Record<string, string>) {
    const vnpHashSecret = this.configService.get<string>('VNP_HASH_SECRET')!;
    const secureHash = query['vnp_SecureHash'];

    // Loại bỏ vnp_SecureHash và vnp_SecureHashType khỏi params
    const params = { ...query };
    delete params['vnp_SecureHash'];
    delete params['vnp_SecureHashType'];

    // Sort theo alphabet và tạo lại query string
    const sortedKeys = Object.keys(params).sort();
    const signData = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');

    // Băm lại chữ ký
    const hmac = crypto.createHmac('sha512', vnpHashSecret);
    const checkSum = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    // So khớp chữ ký
    if (secureHash !== checkSum) {
      return { RspCode: '97', Message: 'Chữ ký không hợp lệ' };
    }

    const txnRef = query['vnp_TxnRef'];
    const responseCode = query['vnp_ResponseCode'];

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: txnRef },
    });

    if (!transaction) {
      return { RspCode: '01', Message: 'Không tìm thấy giao dịch' };
    }

    if (transaction.status !== 'PENDING') {
      return { RspCode: '02', Message: 'Giao dịch đã được xử lý trước đó' };
    }

    // Cập nhật trạng thái
    const newStatus = responseCode === '00' ? 'SUCCESS' : 'FAILED';
    await this.prisma.transaction.update({
      where: { id: txnRef },
      data: { status: newStatus },
    });

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  /**
   * Xác thực IPN từ MoMo
   * Kiểm tra chữ ký, cập nhật trạng thái giao dịch
   */
  async verifyMoMoIpn(body: Record<string, any>) {
    const secretKey = this.configService.get<string>('MOMO_SECRET_KEY')!;
    const accessKey = this.configService.get<string>('MOMO_ACCESS_KEY');

    const {
      partnerCode,
      orderId,
      requestId,
      amount,
      orderInfo,
      orderType,
      transId,
      resultCode,
      message,
      payType,
      responseTime,
      extraData,
      signature,
    } = body;

    // Tạo lại rawSignature theo thứ tự MoMo quy định
    const rawSignature = [
      `accessKey=${accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `message=${message}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `orderType=${orderType}`,
      `partnerCode=${partnerCode}`,
      `payType=${payType}`,
      `requestId=${requestId}`,
      `responseTime=${responseTime}`,
      `resultCode=${resultCode}`,
      `transId=${transId}`,
    ].join('&');

    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(rawSignature)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new BadRequestException('Chữ ký MoMo không hợp lệ');
    }

    // Trích xuất transactionId gốc từ orderId (format: transactionId-timestamp)
    const transactionId = orderId.split('-').slice(0, 5).join('-');

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Không tìm thấy giao dịch với ID ${transactionId}`);
    }

    if (transaction.status !== 'PENDING') {
      return; // Đã xử lý trước đó
    }

    // resultCode === 0 nghĩa là thanh toán thành công
    const newStatus = resultCode === 0 ? 'SUCCESS' : 'FAILED';
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: newStatus },
    });
  }

  /**
   * Xử lý Webhook từ SePay
   * Trích xuất mã giao dịch từ transaction_content (cú pháp: BUS <transactionId>)
   */
  async handleSePayWebhook(body: Record<string, any>) {
    const { transaction_content } = body;

    if (!transaction_content) {
      throw new BadRequestException('Thiếu nội dung chuyển khoản (transaction_content)');
    }

    // Trích xuất transactionId từ nội dung chuyển khoản
    // Cú pháp: BUS <transactionId>
    const match = transaction_content.match(/BUS\s+([a-zA-Z0-9-]+)/i);
    if (!match || !match[1]) {
      throw new BadRequestException('Không thể trích xuất mã giao dịch từ nội dung chuyển khoản');
    }

    const transactionId = match[1];

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Không tìm thấy giao dịch với ID ${transactionId}`);
    }

    if (transaction.status !== 'PENDING') {
      return {
        message: 'Giao dịch đã được xử lý trước đó',
      };
    }

    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'SUCCESS' },
    });

    return {
      message: 'Cập nhật trạng thái giao dịch thành công',
    };
  }

  /**
   * Thanh toán vé (có thể áp mã khuyến mãi)
   * - PARENT: kiểm tra ticket.parentId === currentUser.id, gán parentId = currentUser.id
   * - STUDENT: kiểm tra ticket.studentId === currentUser.id, parentId = null
   * Sử dụng prisma.$transaction để đảm bảo tính toàn vẹn dữ liệu
   */
  async checkout(currentUser: any, checkoutDto: CheckoutDto) {
    const { ticketId, paymentMethod, promotionCode } = checkoutDto;

    // Kiểm tra vé tồn tại
    const ticket = await this.ticketsService.findOne(ticketId);

    // Kiểm tra quyền sở hữu vé
    if (currentUser.role === Role.STUDENT) {
      if (ticket.studentId !== currentUser.id) {
        throw new ForbiddenException('Vé này không thuộc về bạn');
      }
    } else if (currentUser.role === Role.PARENT) {
      if (ticket.parentId !== currentUser.id) {
        throw new ForbiddenException('Vé này không thuộc về bạn');
      }
    } else {
      throw new ForbiddenException('Bạn không có quyền thanh toán');
    }

    // Gán parentId theo role
    const parentId = currentUser.role === Role.PARENT ? currentUser.id : null;

    const totalAmount = ticket.priceAtBuy;
    let discountAmount = 0;
    let promotionId: string | null = null;

    // Nếu có promotionCode, kiểm tra tính hợp lệ và tính giảm giá
    if (promotionCode) {
      const promotion =
        await this.promotionsService.findValidByCode(promotionCode);

      promotionId = promotion.id;

      if (promotion.discountType === DiscountType.PERCENTAGE) {
        discountAmount = (totalAmount * promotion.discountValue) / 100;
      } else {
        // FIXED
        discountAmount = promotion.discountValue;
      }

      // Đảm bảo giảm giá không vượt quá tổng tiền
      if (discountAmount > totalAmount) {
        discountAmount = totalAmount;
      }
    }

    const finalAmount = totalAmount - discountAmount;

    // Sử dụng $transaction để thực hiện 2 việc cùng lúc
    const transaction = await this.prisma.$transaction(async (tx) => {
      // 1. Tạo bản ghi Transaction (trạng thái PENDING)
      const newTransaction = await tx.transaction.create({
        data: {
          ticketId,
          parentId,
          promotionId,
          totalAmount,
          discountAmount,
          finalAmount,
          paymentMethod,
          // status mặc định là PENDING (từ schema)
        },
        include: {
          ticket: {
            select: {
              id: true,
              ticketType: true,
              priceAtBuy: true,
              student: { select: { id: true, fullName: true } },
              route: { select: { id: true, name: true } },
            },
          },
          promotion: {
            select: { id: true, code: true, discountType: true, discountValue: true },
          },
        },
      });

      // 2. Tăng usedCount của Promotion lên 1 (nếu có áp mã)
      if (promotionId) {
        await tx.promotion.update({
          where: { id: promotionId },
          data: { usedCount: { increment: 1 } },
        });
      }

      return newTransaction;
    });

    return {
      message: 'Tạo giao dịch thanh toán thành công',
      result: transaction,
    };
  }

  /**
   * Cập nhật trạng thái thanh toán (Admin hoặc Webhook)
   */
  async updateStatus(
    id: string,
    updateStatusDto: UpdateTransactionStatusDto,
  ) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Không tìm thấy giao dịch với ID ${id}`);
    }

    if (transaction.status !== 'PENDING') {
      throw new BadRequestException(
        'Chỉ có thể cập nhật trạng thái cho giao dịch đang ở trạng thái PENDING',
      );
    }

    return this.prisma.transaction.update({
      where: { id },
      data: { status: updateStatusDto.status },
      include: {
        ticket: {
          select: { id: true, ticketType: true, priceAtBuy: true },
        },
        parent: {
          select: { id: true, fullName: true, email: true },
        },
        promotion: {
          select: { id: true, code: true },
        },
      },
    });
  }

  /**
   * Lấy danh sách giao dịch (Admin)
   */
  async findAll(query: QueryTransactionsDto) {
    const { status, paymentMethod, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ticket: {
            select: {
              id: true,
              ticketType: true,
              priceAtBuy: true,
              student: { select: { id: true, fullName: true } },
              route: { select: { id: true, name: true } },
            },
          },
          parent: {
            select: { id: true, fullName: true, email: true },
          },
          promotion: {
            select: { id: true, code: true, discountType: true, discountValue: true },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách giao dịch thành công',
      result: {
        data: items,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Lấy lịch sử giao dịch cá nhân
   */
  async getMyTransactions(currentUser: any, query: QueryTransactionsDto) {
    const { status, paymentMethod, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };

    if (currentUser.role === Role.STUDENT) {
      // Lọc giao dịch mà vé thuộc về học sinh này
      where.ticket = { studentId: currentUser.id };
    } else {
      where.parentId = currentUser.id;
    }

    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ticket: {
            select: {
              id: true,
              ticketType: true,
              priceAtBuy: true,
              student: { select: { id: true, fullName: true } },
              route: { select: { id: true, name: true } },
            },
          },
          promotion: {
            select: { id: true, code: true, discountType: true, discountValue: true },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      message: 'Lấy lịch sử giao dịch thành công',
      result: {
        data: items,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }
}
