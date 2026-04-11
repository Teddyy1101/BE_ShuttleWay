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
import { NotificationsService } from '../notifications/notifications.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { DiscountType, Role, TicketStatus } from '../../../generated/prisma/client';
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
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Sinh mã giao dịch tự động theo quy luật SWTT-dd/mm/yy-0001
   * Số thứ tự tăng dần theo ngày
   */
  private async generateTransactionCode(): Promise<string> {
    const now = new Date();
    const dd = now.getDate().toString().padStart(2, '0');
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const yy = now.getFullYear().toString().slice(-2);
    const prefix = `SWTT-${dd}/${mm}/${yy}`;

    // Đếm số giao dịch đã tạo trong ngày hôm nay
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const count = await this.prisma.transaction.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });

    const seq = (count + 1).toString().padStart(4, '0');
    return `${prefix}-${seq}`;
  }


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

    // Sort theo alphabet
    const sortedKeys = Object.keys(vnpParams).sort();

    // Tạo chuỗi ký: encode giá trị trước khi ký (đúng spec VNPay)
    const signData = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(vnpParams[key]).replace(/%20/g, '+')}`)
      .join('&');

    // Tạo chữ ký HMAC SHA512
    const hmac = crypto.createHmac('sha512', vnpHashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    // Tạo URL thanh toán: cũng encode giá trị trong URL
    const queryString = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(vnpParams[key]).replace(/%20/g, '+')}`)
      .join('&');

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
    // Lưu ý: VNPay gửi callback với giá trị đã decode, nên cần encode lại khi verify
    const sortedKeys = Object.keys(params).sort();
    const signData = sortedKeys
      .map((key) => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
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



    // Gửi thông báo in-app khi thanh toán thành công
    if (newStatus === 'SUCCESS') {
      try {
        await this.notifyPaymentSuccess(txnRef);
      } catch (err) {
        this.logger.error(`VNPay IPN: Lỗi gửi thông báo: ${err.message}`, err.stack);
      }
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  /*
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

    // Gửi thông báo in-app khi thanh toán thành công
    if (newStatus === 'SUCCESS') {
      try {
        await this.notifyPaymentSuccess(transactionId);
      } catch (err) {
        this.logger.error(`MoMo IPN: Lỗi gửi thông báo: ${err.message}`, err.stack);
      }
    }
  }

  /**
   * Tái tạo UUID format từ chuỗi hex có thể bị ngân hàng xóa dấu `-`
   */
  private normalizeUuid(raw: string): string {
    const cleaned = raw.replace(/-/g, '').toLowerCase();

    // Nếu đúng 32 ký tự hex → chèn lại dấu `-` theo format UUID (8-4-4-4-12)
    if (/^[a-f0-9]{32}$/.test(cleaned)) {
      return [
        cleaned.slice(0, 8),
        cleaned.slice(8, 12),
        cleaned.slice(12, 16),
        cleaned.slice(16, 20),
        cleaned.slice(20),
      ].join('-');
    }

    // Nếu đã có format UUID chuẩn → trả về lowercase
    return raw.toLowerCase();
  }

  /**
   * Xử lý Webhook từ SePay
   */
  async handleSePayWebhook(body: Record<string, any>) {
    const { content, transferAmount, transferType } = body;

    // Chỉ xử lý giao dịch NHẬN tiền (in), bỏ qua chuyển đi (out)
    if (transferType === 'out') {
      return { success: true, message: 'Bỏ qua giao dịch chuyển đi' };
    }

    // SePay gửi nội dung CK trong field "content"
    const transactionContent = content || body['transaction_content'] || '';

    if (!transactionContent) {
      return { success: false, message: 'Thiếu nội dung chuyển khoản' };
    }

    // Trích xuất transactionId từ nội dung chuyển khoản
    
    const match = transactionContent.match(/BUS\s*([a-zA-Z0-9-]{32,36})/i);
    if (!match || !match[1]) {
      return { success: false, message: 'Không tìm thấy mã giao dịch trong nội dung CK' };
    }

    const extractedRaw = match[1].trim();
    const transactionId = this.normalizeUuid(extractedRaw);

    // Tìm giao dịch trong DB
    let transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    // Fallback: nếu không tìm thấy, thử tìm giao dịch PENDING có ID chứa chuỗi đã extract
    if (!transaction) {
      const cleanedRaw = extractedRaw.replace(/-/g, '').toLowerCase();
      const pendingTransactions = await this.prisma.transaction.findMany({
        where: { status: 'PENDING', paymentMethod: 'SEPAY' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // So sánh UUID đã clean với từng giao dịch PENDING
      transaction = pendingTransactions.find((t) => {
        const cleanId = t.id.replace(/-/g, '').toLowerCase();
        return cleanId === cleanedRaw;
      }) ?? null;
    }

    if (!transaction) {
      return { success: false, message: 'Không tìm thấy giao dịch' };
    }

    if (transaction.status !== 'PENDING') {
      return { success: true, message: 'Giao dịch đã được xử lý trước đó' };
    }
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SUCCESS' },
    });



    // Fire-and-forget: Gửi thông báo in-app khi thanh toán thành công
    this.notifyPaymentSuccess(transaction.id).catch((err) =>
      this.logger.error('Lỗi gửi thông báo thanh toán SePay', err.message),
    );

    return { success: true, message: 'Cập nhật trạng thái giao dịch thành công' };
  }

  /**
   * Gửi thông báo khi thanh toán thành công
   */
  private async notifyPaymentSuccess(transactionId: string) {


    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        ticket: {
          select: {
            id: true,
            studentId: true,
            parentId: true,
            status: true,
            route: { select: { name: true } },
          },
        },
      },
    });

    if (!transaction) {

      return;
    }

    if (!transaction.ticket) {

      return;
    }

    // Kích hoạt vé nếu chưa ACTIVE
    if (transaction.ticket.status !== TicketStatus.ACTIVE) {
      await this.prisma.ticket.update({
        where: { id: transaction.ticket.id },
        data: { status: TicketStatus.ACTIVE },
      });

    }

    const routeName = transaction.ticket.route?.name ?? 'không xác định';
    const title = 'Đặt vé thành công';
    const body = `Đặt vé xe tuyến ${routeName} thành công.`;

    // Thu thập danh sách người nhận (parent + student, loại bỏ null/trùng)
    const recipientIds = new Set<string>();
    if (transaction.ticket.parentId) recipientIds.add(transaction.ticket.parentId);
    if (transaction.ticket.studentId) recipientIds.add(transaction.ticket.studentId);

    if (recipientIds.size === 0) {

      return;
    }

    // Gửi push notification cho từng người nhận
    for (const userId of recipientIds) {
      try {

        await this.notificationsService.sendPushNotification(userId, title, body);
      } catch (err) {
        this.logger.error(`notifyPaymentSuccess: Lỗi gửi thông báo cho user ${userId}: ${err.message}`);
      }
    }


  }

  /**
   * Cập nhật trạng thái giao dịch + gửi thông báo nếu thành công.
   */
  async processMoMoReturn(orderId: string, isSuccess: boolean) {
    // orderId format: transactionId-timestamp → tách lấy transactionId
    const transactionId = orderId.split('-').slice(0, 5).join('-');



    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {

      return;
    }

    if (transaction.status !== 'PENDING') {

      return;
    }

    const newStatus = isSuccess ? 'SUCCESS' : 'FAILED';
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: newStatus },
    });



    if (newStatus === 'SUCCESS') {
      try {
        await this.notifyPaymentSuccess(transactionId);
      } catch (err) {
        this.logger.error(`MoMo Return: Lỗi gửi thông báo: ${err.message}`, err.stack);
      }
    }
  }

  /**
   * Xác nhận thanh toán từ mobile (sau khi WebView phát hiện thanh toán thành công).
   */
  async confirmPaymentFromMobile(
    transactionId: string,
    body: { responseCode?: string; resultCode?: string },
  ) {


    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException(`Không tìm thấy giao dịch ${transactionId}`);
    }

    // Nếu đã xử lý rồi thì trả về luôn
    if (transaction.status !== 'PENDING') {

      return {
        message: `Giao dịch đã được xử lý trước đó (${transaction.status})`,
        result: { status: transaction.status },
      };
    }

    // Xác định kết quả:
    const isSuccess =
      body.responseCode === '00' || body.responseCode === '0' || body.resultCode === '0';

    const newStatus = isSuccess ? 'SUCCESS' : 'FAILED';

    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: newStatus },
    });



    // Kích hoạt vé + gửi thông báo nếu thành công
    if (newStatus === 'SUCCESS') {
      try {
        await this.notifyPaymentSuccess(transactionId);
      } catch (err) {
        this.logger.error(`confirmPaymentFromMobile: Lỗi gửi thông báo: ${err.message}`, err.stack);
      }
    }

    return {
      message: isSuccess ? 'Xác nhận thanh toán thành công' : 'Giao dịch thất bại',
      result: { status: newStatus },
    };
  }

  /**
   * Thanh toán vé (có thể áp mã khuyến mãi)
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

    // Sinh mã giao dịch tự động (SWTT-dd/mm/yy-0001)
    const transactionCode = await this.generateTransactionCode();

    // Sử dụng $transaction để thực hiện 2 việc cùng lúc
    const transaction = await this.prisma.$transaction(async (tx) => {
      // 1. Tạo bản ghi Transaction (trạng thái PENDING)
      const newTransaction = await tx.transaction.create({
        data: {
          transactionCode,
          ticketId,
          userId: currentUser.id,
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
          user: {
            select: { id: true, fullName: true, email: true, phone: true },
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

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: { status: updateStatusDto.status },
      include: {
        ticket: {
          select: { id: true, ticketType: true, priceAtBuy: true },
        },
        user: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        promotion: {
          select: { id: true, code: true },
        },
      },
    });

    // Gửi thông báo khi thanh toán thành công
    if (updateStatusDto.status === 'SUCCESS') {
      this.notifyPaymentSuccess(id).catch((err) =>
        this.logger.error('Lỗi gửi thông báo thanh toán', err.message),
      );
    }

    return updated;
  }

  /**
   * Lấy danh sách giao dịch (Admin)
   */
  async findAll(query: QueryTransactionsDto) {
    const { status, paymentMethod, search, fromDate, toDate, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    // Lọc theo khoảng thời gian
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    // Tìm kiếm theo tên người dùng, số điện thoại, mã giao dịch hoặc mã GD
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { transactionCode: { contains: search, mode: 'insensitive' } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search, mode: 'insensitive' } } },
      ];
    }

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
          user: {
            select: { id: true, fullName: true, email: true, phone: true },
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
   * Thống kê dòng tiền (Tổng doanh thu, Tiền chờ nhận, Cơ cấu theo phương thức)
   */
  async getStats() {
    const where = { isActive: true };

    // Tổng doanh thu (SUCCESS)
    const revenueResult = await this.prisma.transaction.aggregate({
      where: { ...where, status: 'SUCCESS' },
      _sum: { finalAmount: true },
    });

    // Tổng tiền chờ nhận (PENDING)
    const pendingResult = await this.prisma.transaction.aggregate({
      where: { ...where, status: 'PENDING' },
      _sum: { finalAmount: true },
    });

    // Cơ cấu dòng tiền theo phương thức thanh toán (chỉ SUCCESS)
    const byMethodResult = await this.prisma.transaction.groupBy({
      by: ['paymentMethod'],
      where: { ...where, status: 'SUCCESS' },
      _sum: { finalAmount: true },
    });

    const byPaymentMethod: Record<string, number> = {};
    byMethodResult.forEach((item) => {
      byPaymentMethod[item.paymentMethod] = item._sum.finalAmount || 0;
    });

    return {
      message: 'Lấy thống kê giao dịch thành công',
      result: {
        totalRevenue: revenueResult._sum.finalAmount || 0,
        pendingAmount: pendingResult._sum.finalAmount || 0,
        byPaymentMethod,
      },
    };
  }

  //Kiểm tra trạng thái giao dịch (dùng cho mobile polling SePay)
  async getTransactionStatus(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { id: true, status: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Không tìm thấy giao dịch với ID ${transactionId}`);
    }

    return {
      message: 'Lấy trạng thái giao dịch thành công',
      result: { status: transaction.status },
    };
  }

  // Lấy lịch sử giao dịch cá nhân
  async getMyTransactions(currentUser: any, query: QueryTransactionsDto) {
    const { status, paymentMethod, fromDate, toDate, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };

    if (currentUser.role === Role.STUDENT) {
      // Lọc giao dịch mà vé thuộc về học sinh này
      where.ticket = { studentId: currentUser.id };
    } else {
      where.userId = currentUser.id;
    }

    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    // Lọc theo khoảng thời gian
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

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
          user: {
            select: { id: true, fullName: true, role: true },
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
