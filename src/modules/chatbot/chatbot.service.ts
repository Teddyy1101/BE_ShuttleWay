import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ChatbotAskDto } from './dto/chatbot-ask.dto';
import axios from 'axios';
import { endOfWeek, startOfWeek } from 'date-fns';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly ollamaBaseUrl: string;
  private readonly ollamaModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.ollamaBaseUrl =
      this.configService.get<string>('OLLAMA_BASE_URL') ||
      'http://localhost:11434';
    this.ollamaModel =
      this.configService.get<string>('OLLAMA_MODEL') || 'gemma3:1b';

    this.logger.log(
      `Ollama config: baseUrl=${this.ollamaBaseUrl}, model=${this.ollamaModel}`,
    );
  }

  /**
   * Xử lý câu hỏi: pre-check cho câu hỏi cá nhân (vé/lịch trình) → trả trực tiếp
   * Các câu hỏi chung → gom data → gọi LLM 1 lần
   */
  async ask(currentUser: any, dto: ChatbotAskDto): Promise<{ reply: string }> {
    try {
      const msg = dto.message.toLowerCase().trim();

      // === PRE-CHECK 1: GREETING → delay 3s + trả lời ngay ===
      const greetings = ['xin chào', 'chào bạn', 'hello', 'hi', 'bạn là ai', 'bạn là gì', 'bot là ai', 'bạn tên gì', 'chào'];
      if (greetings.some(g => msg === g || msg.startsWith(g + ' ') || msg.startsWith(g + '?'))) {
        await new Promise(r => setTimeout(r, 3000));
        return {
          reply: 'Chào bạn! Tôi là trợ lý tư vấn AI của ShuttleWay — hệ thống xe buýt trường học thông minh. Tôi có thể giúp bạn tra cứu tuyến đường, giá vé, lịch trình, chuyến đi và nhiều thông tin khác. Bạn cần hỗ trợ gì?',
        };
      }

      // === PRE-CHECK 2: "xem thêm" liệt kê tuyến ===
      const showMoreKw = ['xem thêm', 'tiếp theo', 'tiếp'];
      if (showMoreKw.some(kw => msg === kw || msg.includes(kw))) {
        const lastBotMsg = [...(dto.history || [])].reverse().find(h => h.role === 'model');
        if (lastBotMsg && lastBotMsg.content.includes('tuyến nữa')) {
          const directReply = await this.listRoutesPaginated(dto.history);
          return { reply: directReply };
        }
      }

      // === PRE-CHECK 3: Liệt kê tuyến đường ===
      const listRoutesKw = ['liệt kê tuyến', 'liệt kê các tuyến', 'danh sách tuyến', 'có những tuyến nào', 'các tuyến đường', 'xem tuyến'];
      if (listRoutesKw.some(kw => msg.includes(kw))) {
        const directReply = await this.listRoutesPaginated([]);
        return { reply: directReply };
      }

      // === PRE-CHECK 4: Câu hỏi cá nhân (vé / lịch trình) → xử lý trực tiếp, KHÔNG qua LLM ===
      const ticketKw = ['vé của', 'vé còn', 'xem vé', 'kiểm tra vé', 'còn hạn', 'hết hạn', 'có vé nào', 'thông tin vé'];
      const scheduleKw = ['lịch trình', 'chuyến đi', 'hôm nay đi', 'lịch đi học'];
      const isTicketQuery = ticketKw.some(kw => msg.includes(kw));
      const isScheduleQuery = scheduleKw.some(kw => msg.includes(kw));

      if (isTicketQuery || isScheduleQuery) {
        // Tìm studentIds liên kết
        const resolved = await this.resolveStudentIds(currentUser, msg);
        if (resolved.directReply) return { reply: resolved.directReply };

        if (isTicketQuery) {
          const reply = await this.directTicketReply(resolved.studentIds, resolved.studentName);
          return { reply };
        }
        if (isScheduleQuery) {
          const isToday = msg.includes('hôm nay') || msg.includes('ngày');
          const reply = await this.directScheduleReply(resolved.studentIds, resolved.studentName, isToday);
          return { reply };
        }
      }

      // === Luồng chính: gom data → gọi LLM 1 lần ===
      const [routesText, ticketsText, tripsText, promosText] = await Promise.all([
        this.getActiveRoutes(),
        this.getUserTickets(currentUser),
        this.getUserTrips(currentUser),
        this.getActivePromotions(),
      ]);

      const userRole = currentUser.role === 'PARENT' ? 'phụ huynh' : 'học sinh';
      const today = new Date().toLocaleDateString('vi-VN');
      const systemInstruction = this.buildSystemInstruction(
        routesText,
        ticketsText,
        tripsText,
        promosText,
        userRole,
        today,
      );

      const messages: { role: string; content: string }[] = [
        { role: 'system', content: systemInstruction },
      ];

      for (const m of dto.history) {
        messages.push({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content,
        });
      }

      messages.push({ role: 'user', content: dto.message });

      const reply = await this.callOllama(messages);
      return { reply };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Lỗi khi gọi Ollama API: ${errorMessage}`);
      return {
        reply:
          'Xin lỗi, hệ thống tư vấn đang gặp sự cố. Vui lòng thử lại sau hoặc liên hệ hotline để được hỗ trợ.',
      };
    }
  }

  /**
   * Liệt kê tuyến phân trang (5 tuyến/lần), trả trực tiếp không cần LLM
   */
  private async listRoutesPaginated(history: any[]): Promise<string> {
    const allRoutes = await this.prisma.route.findMany({
      where: { isActive: true },
      include: {
        routeStations: { include: { station: true }, orderBy: { orderIndex: 'asc' } },
      },
    });

    if (allRoutes.length === 0) return 'Hiện tại hệ thống chưa có tuyến đường nào.';

    // Tính offset từ history
    let offset = 0;
    if (history && history.length > 0) {
      const prevPages = history.filter(h => h.role === 'model' && h.content.includes('tuyến nữa')).length;
      offset = (prevPages + 1) * 5;
    }

    const pageSize = 5;
    const pageRoutes = allRoutes.slice(offset, offset + pageSize);
    const remaining = allRoutes.length - offset - pageRoutes.length;

    if (pageRoutes.length === 0) return 'Đã hiển thị hết tất cả các tuyến đường rồi bạn nhé!';

    let result = `Hệ thống có ${allRoutes.length} tuyến đường:\n\n`;
    result += pageRoutes.map((r, i) => {
      const stations = r.routeStations.map(rs => rs.station.name).join(' → ');
      const time = r.estimatedTime ? new Date(r.estimatedTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
      return `${offset + i + 1}. ${r.name} (${r.routeCode})\n   Ca: ${r.shiftType === 'MORNING' ? 'Sáng' : 'Chiều'} | Khởi hành: ${time}\n   Giá lượt: ${r.singlePrice.toLocaleString('vi-VN')}đ | Giá tháng: ${r.monthlyPrice.toLocaleString('vi-VN')}đ\n   Các trạm: ${stations}`;
    }).join('\n\n');

    if (remaining > 0) {
      result += `\n\nCòn ${remaining} tuyến nữa. Nhắn "xem thêm" để tôi liệt kê tiếp hoặc vào trang Đặt vé để xem tất cả.`;
    }

    return result;
  }

  /**
   * Xác định studentIds từ user role + tin nhắn (xử lý phụ huynh nhiều HS)
   */
  private async resolveStudentIds(currentUser: any, msg: string): Promise<{ studentIds: string[]; studentName: string; directReply?: string }> {
    if (currentUser.role === 'STUDENT') {
      const student = await this.prisma.user.findUnique({ where: { id: currentUser.id }, select: { fullName: true } });
      return { studentIds: [currentUser.id], studentName: student?.fullName ?? '' };
    }

    if (currentUser.role === 'PARENT') {
      const relations = await this.prisma.parentStudent.findMany({
        where: { parentId: currentUser.id, isActive: true },
        include: { student: { select: { id: true, fullName: true } } },
      });

      if (relations.length === 0) {
        return { studentIds: [], studentName: '', directReply: 'Tài khoản của bạn chưa được liên kết với học sinh nào. Vui lòng liên kết học sinh trong mục Cá nhân.' };
      }

      // 1 HS → trả luôn
      if (relations.length === 1) {
        return { studentIds: [relations[0].student.id], studentName: relations[0].student.fullName };
      }

      // 2+ HS → kiểm tra tên trong tin nhắn
      const matched = relations.find(r => msg.includes(r.student.fullName.toLowerCase()));
      if (matched) {
        return { studentIds: [matched.student.id], studentName: matched.student.fullName };
      }

      // Không nhắc tên → hỏi lại
      const names = relations.map(r => r.student.fullName).join(', ');
      return {
        studentIds: [],
        studentName: '',
        directReply: `Tài khoản của bạn đang liên kết với ${relations.length} học sinh (${names}). Bạn muốn xem thông tin của học sinh nào ạ?\nVí dụ: "lịch trình của ${relations[0].student.fullName}" hoặc "vé của ${relations[0].student.fullName}".`,
      };
    }

    return { studentIds: [], studentName: '', directReply: 'Chức năng này dành cho học sinh và phụ huynh.' };
  }

  /**
   * Trả lời trực tiếp về vé — so sánh ngày bằng code, KHÔNG phụ thuộc LLM
   */
  private async directTicketReply(studentIds: string[], studentName: string): Promise<string> {
    const tickets = await this.prisma.ticket.findMany({
      where: { studentId: { in: studentIds }, isActive: true },
      include: { route: { select: { name: true } }, student: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (tickets.length === 0) return `${studentName} hiện không có vé nào.`;

    const today = new Date();
    const validTickets = tickets.filter(t => new Date(t.validUntil) >= today && t.status === 'ACTIVE');
    const expiredTickets = tickets.filter(t => new Date(t.validUntil) < today || t.status !== 'ACTIVE');

    let reply = `Thông tin vé của ${studentName}:\n\n`;

    if (validTickets.length > 0) {
      reply += `✅ Vé CÒN HẠN (${validTickets.length}):\n`;
      reply += validTickets.map((t, i) => {
        const loai = t.ticketType === 'MONTHLY' ? 'Vé tháng' : 'Vé lượt';
        return `${i + 1}. ${loai} - Tuyến: ${t.route?.name ?? 'N/A'}\n   Hạn: ${new Date(t.validFrom).toLocaleDateString('vi-VN')} đến ${new Date(t.validUntil).toLocaleDateString('vi-VN')}`;
      }).join('\n');
    } else {
      reply += '❌ Hiện không có vé nào còn hạn.';
    }

    if (expiredTickets.length > 0) {
      reply += `\n\n⏰ Vé ĐÃ HẾT HẠN (${expiredTickets.length}):`;
      reply += '\n' + expiredTickets.slice(0, 3).map((t, i) => {
        const loai = t.ticketType === 'MONTHLY' ? 'Vé tháng' : 'Vé lượt';
        return `${i + 1}. ${loai} - Tuyến: ${t.route?.name ?? 'N/A'} (hết hạn ${new Date(t.validUntil).toLocaleDateString('vi-VN')})`;
      }).join('\n');
      if (expiredTickets.length > 3) {
        reply += `\n   ...và ${expiredTickets.length - 3} vé hết hạn khác.`;
      }
    }

    if (validTickets.length === 0) {
      reply += '\n\nBạn có thể mua vé mới trong mục Đặt vé trên ứng dụng.';
    }

    return reply;
  }

  /**
   * Trả lời trực tiếp về lịch trình — query Ticket→Trip giống tab Lịch trình
   */
  private async directScheduleReply(studentIds: string[], studentName: string, todayOnly: boolean): Promise<string> {
    const today = new Date();
    const startOfWk = startOfWeek(today, { weekStartsOn: 1 });
    const endOfWk = endOfWeek(today, { weekStartsOn: 1 });

    // Date range: hôm nay hoặc cả tuần
    let dateStart: Date;
    let dateEnd: Date;
    if (todayOnly) {
      // Dùng UTC midnight để khớp với Prisma @db.Date
      dateStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0));
      dateEnd = dateStart;
    } else {
      dateStart = startOfWk;
      dateEnd = endOfWk;
    }

    // Tìm vé active còn hiệu lực
    const activeTickets = await this.prisma.ticket.findMany({
      where: {
        studentId: { in: studentIds },
        status: 'ACTIVE',
        isActive: true,
        validFrom: { lte: dateEnd },
        validUntil: { gte: dateStart },
      },
      select: { routeId: true },
    });

    const routeIds = [...new Set(activeTickets.map(t => t.routeId))];

    const todayStr = today.toLocaleDateString('vi-VN');
    const headerDate = todayOnly ? `hôm nay (${todayStr})` : 'tuần này';

    if (routeIds.length === 0) {
      return `${studentName} không có vé nào còn hiệu lực ${headerDate}, nên không có lịch trình.\nBạn có thể mua vé trong mục Đặt vé.`;
    }

    // Tìm Trip
    const trips = await this.prisma.trip.findMany({
      where: {
        routeId: { in: routeIds },
        isActive: true,
        scheduledDate: todayOnly ? dateStart : { gte: dateStart, lte: dateEnd },
        status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] },
      },
      include: {
        route: { select: { name: true, routeCode: true, estimatedTime: true } },
        driver: { select: { fullName: true, phone: true } },
        bus: { select: { licensePlate: true } },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    if (trips.length === 0) {
      return `Lịch trình ${headerDate} của ${studentName}:\n\nKhông có chuyến đi nào được xếp lịch ${headerDate}.`;
    }

    const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

    let reply = `Lịch trình ${headerDate} của ${studentName}:\n\n`;
    reply += trips.map((t, i) => {
      const dateObj = new Date(t.scheduledDate);
      const dayOfWeek = days[dateObj.getDay()];
      const dateStr = dateObj.toLocaleDateString('vi-VN');
      const dir = t.direction === 'PICK_UP' ? 'Đón' : 'Trả';
      const routeTime = t.route.estimatedTime
        ? new Date(t.route.estimatedTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : 'N/A';
      const driverInfo = t.driver ? `${t.driver.fullName} (${t.driver.phone ?? 'N/A'})` : 'Chưa xếp';
      const busInfo = t.bus ? t.bus.licensePlate : 'Chưa xếp';
      const statusMap: Record<string, string> = { PENDING: 'Chờ khởi hành', IN_PROGRESS: 'Đang chạy', COMPLETED: 'Hoàn thành' };

      return `${i + 1}. ${dayOfWeek} (${dateStr}) - ${dir} lúc ${routeTime}\n   Tuyến: ${t.route.name} (${t.route.routeCode})\n   Xe: ${busInfo} | Tài xế: ${driverInfo}\n   Trạng thái: ${statusMap[t.status] ?? t.status}`;
    }).join('\n\n');

    return reply;
  }

  /**
   * Gọi Ollama REST API
   */
  private async callOllama(
    messages: { role: string; content: string }[],
  ): Promise<string> {
    const url = `${this.ollamaBaseUrl}/api/chat`;

    const response = await axios.post(
      url,
      {
        model: this.ollamaModel,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 512,
        },
      },
      { timeout: 220_000 },
    );

    const content = response.data?.message?.content;
    return (
      content?.trim() ||
      'Xin lỗi, tôi không thể trả lời lúc này. Vui lòng thử lại sau.'
    );
  }

  /**
   * Lấy tuyến đường active (giới hạn 15 tuyến để context không quá lớn)
   */
  private async getActiveRoutes(): Promise<string> {
    const routes = await this.prisma.route.findMany({
      where: { isActive: true },
      select: {
        name: true,
        routeCode: true,
        shiftType: true,
        singlePrice: true,
        monthlyPrice: true,
        estimatedTime: true,
        routeStations: {
          select: {
            orderIndex: true,
            station: { select: { name: true } },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
      take: 15,
    });

    if (routes.length === 0) return 'Hiện chưa có tuyến đường nào.';

    const totalCount = await this.prisma.route.count({ where: { isActive: true } });

    let result = routes
      .map((r, i) => {
        const ca = r.shiftType === 'MORNING' ? 'Sáng' : 'Chiều';
        const stations = r.routeStations
          .map((rs) => rs.station.name)
          .join(' → ');
        const time = r.estimatedTime
          ? new Date(r.estimatedTime).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'N/A';

        return `Tuyến ${i + 1}: ${r.name} (${r.routeCode}), ca ${ca}, khởi hành ${time}, vé lượt ${r.singlePrice.toLocaleString('vi-VN')}đ, vé tháng ${r.monthlyPrice.toLocaleString('vi-VN')}đ, trạm: ${stations}`;
      })
      .join('\n');

    if (totalCount > routes.length) {
      result += `\n(Còn ${totalCount - routes.length} tuyến nữa trong hệ thống)`;
    }

    return result;
  }

  /**
   * Lấy vé của user — hỗ trợ phụ huynh xem vé của học sinh liên kết
   */
  private async getUserTickets(currentUser: any): Promise<string> {
    let studentIds: string[] = [];
    let linkedStudentNames: string[] = [];

    if (currentUser.role === 'STUDENT') {
      studentIds = [currentUser.id];
    } else if (currentUser.role === 'PARENT') {
      const relations = await this.prisma.parentStudent.findMany({
        where: { parentId: currentUser.id, isActive: true },
        include: { student: { select: { id: true, fullName: true } } },
      });

      if (relations.length === 0) {
        return 'Phụ huynh chưa liên kết với học sinh nào.';
      }

      studentIds = relations.map(r => r.student.id);
      linkedStudentNames = relations.map(r => r.student.fullName);
    } else {
      return 'Không có vé.';
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { studentId: { in: studentIds }, isActive: true },
      select: {
        ticketType: true,
        status: true,
        priceAtBuy: true,
        validFrom: true,
        validUntil: true,
        route: { select: { name: true } },
        student: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    let header = '';
    if (currentUser.role === 'PARENT' && linkedStudentNames.length > 0) {
      header = `Phụ huynh đang liên kết với ${linkedStudentNames.length} học sinh: ${linkedStudentNames.join(', ')}.\n`;
    }

    if (tickets.length === 0) return header + 'Không có vé nào.';

    const today = new Date();
    const ticketLines = tickets
      .map((t, i) => {
        const loai = t.ticketType === 'MONTHLY' ? 'Vé tháng' : 'Vé lượt';
        const from = new Date(t.validFrom).toLocaleDateString('vi-VN');
        const until = new Date(t.validUntil).toLocaleDateString('vi-VN');
        const isExpired = new Date(t.validUntil) < today;
        const statusText = isExpired ? 'HẾT HẠN' : (t.status === 'ACTIVE' ? 'CÒN HẠN' : t.status);
        return `Vé ${i + 1}: ${loai}, tuyến ${t.route?.name ?? 'N/A'}, học sinh ${t.student?.fullName ?? 'N/A'}, trạng thái ${statusText}, hiệu lực ${from} - ${until}`;
      })
      .join('\n');

    return header + ticketLines;
  }

  /**
   * Lấy lịch trình chuyến đi tuần này của user (qua vé → trip)
   */
  private async getUserTrips(currentUser: any): Promise<string> {
    let studentIds: string[] = [];

    if (currentUser.role === 'STUDENT') {
      studentIds = [currentUser.id];
    } else if (currentUser.role === 'PARENT') {
      const relations = await this.prisma.parentStudent.findMany({
        where: { parentId: currentUser.id, isActive: true },
        select: { studentId: true },
      });
      studentIds = relations.map(r => r.studentId);
    } else {
      return 'Không có chuyến đi.';
    }

    if (studentIds.length === 0) return 'Chưa liên kết học sinh nào.';

    const today = new Date();
    const startOfWk = startOfWeek(today, { weekStartsOn: 1 });
    const endOfWk = endOfWeek(today, { weekStartsOn: 1 });

    // Tìm vé active → routeId → Trip (giống logic getMySchedule)
    const activeTickets = await this.prisma.ticket.findMany({
      where: {
        studentId: { in: studentIds },
        status: 'ACTIVE',
        isActive: true,
        validFrom: { lte: endOfWk },
        validUntil: { gte: startOfWk },
      },
      select: { routeId: true, student: { select: { fullName: true } } },
    });

    if (activeTickets.length === 0) return 'Tuần này không có chuyến đi nào (không có vé active).';

    const routeIds = [...new Set(activeTickets.map(t => t.routeId))];

    const trips = await this.prisma.trip.findMany({
      where: {
        routeId: { in: routeIds },
        isActive: true,
        scheduledDate: { gte: startOfWk, lte: endOfWk },
        status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] },
      },
      include: {
        route: { select: { name: true, routeCode: true, estimatedTime: true } },
        driver: { select: { fullName: true, phone: true } },
        bus: { select: { licensePlate: true } },
      },
      orderBy: { scheduledDate: 'asc' },
      take: 10,
    });

    if (trips.length === 0) return 'Tuần này không có chuyến đi nào được xếp lịch.';

    const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

    return trips.map((t, i) => {
      const dateObj = new Date(t.scheduledDate);
      const dayOfWeek = days[dateObj.getDay()];
      const dateStr = dateObj.toLocaleDateString('vi-VN');
      const dir = t.direction === 'PICK_UP' ? 'Đón' : 'Trả';
      const routeTime = t.route.estimatedTime
        ? new Date(t.route.estimatedTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : 'N/A';
      const driverInfo = t.driver ? `${t.driver.fullName} (${t.driver.phone ?? 'N/A'})` : 'Chưa xếp';
      const busInfo = t.bus ? t.bus.licensePlate : 'Chưa xếp';
      const statusMap: Record<string, string> = { PENDING: 'Chờ khởi hành', IN_PROGRESS: 'Đang chạy', COMPLETED: 'Hoàn thành' };

      return `Chuyến ${i + 1}: ${dayOfWeek} ${dateStr}, ${dir} lúc ${routeTime}, tuyến ${t.route.name} (${t.route.routeCode}), xe ${busInfo}, tài xế ${driverInfo}, trạng thái ${statusMap[t.status] ?? t.status}`;
    }).join('\n');
  }

  /**
   * Lấy khuyến mãi đang hoạt động
   */
  private async getActivePromotions(): Promise<string> {
    const promos = await this.prisma.promotion.findMany({
      where: { isActive: true, validUntil: { gte: new Date() } },
      take: 5,
    });

    if (promos.length === 0) return 'Hiện không có khuyến mãi nào.';

    return promos.map(p =>
      `Mã ${p.code}: giảm ${p.discountValue}${p.discountType === 'PERCENTAGE' ? '%' : 'đ'}, hạn đến ${new Date(p.validUntil).toLocaleDateString('vi-VN')}`
    ).join('\n');
  }

  /**
   * System instruction — hướng dẫn AI trả lời tự nhiên dựa trên dữ liệu
   */
  private buildSystemInstruction(
    routesText: string,
    ticketsText: string,
    tripsText: string,
    promosText: string,
    userRole: string,
    today: string,
  ): string {
    return `Bạn là trợ lý tư vấn AI của ShuttleWay — hệ thống xe buýt trường học thông minh.
Ngày hôm nay: ${today}. Người dùng hiện tại là: ${userRole}.

QUY TẮC:
- Trả lời tiếng Việt, lịch sự, ngắn gọn, tự nhiên như người tư vấn thực sự.
- CHỈ dùng dữ liệu bên dưới. KHÔNG bịa đặt.
- PHÂN TÍCH dữ liệu trước khi trả lời. Ví dụ: hỏi "vé nào còn hạn" → kiểm tra trạng thái từng vé → nếu tất cả HẾT HẠN thì nói "Hiện không có vé nào còn hạn", KHÔNG liệt kê vé hết hạn.
- Hỏi "lịch trình hôm nay/tuần này" → xem mục CHUYẾN ĐI TUẦN NÀY, nếu không có chuyến nào → nói rõ "Không có chuyến đi nào".
- Liệt kê tuyến đường → hiển thị tên, mã tuyến, ca, giá vé, trạm dừng. Nếu nhiều tuyến thì gạch đầu dòng cho dễ đọc.
- Nếu phụ huynh có nhiều học sinh liên kết → khi hỏi về vé/lịch trình mà không nói rõ tên, hãy hỏi lại muốn xem của học sinh nào.
- Nếu phụ huynh chỉ liên kết 1 học sinh → trả lời luôn kèm tên học sinh.
- Nếu không tìm thấy thông tin: "Hiện tại tôi chưa có thông tin này, bạn vui lòng liên hệ hotline để được hỗ trợ ạ."

DANH SÁCH TUYẾN ĐƯỜNG:
${routesText}

VÉ CỦA NGƯỜI DÙNG:
${ticketsText}

CHUYẾN ĐI TUẦN NÀY:
${tripsText}

KHUYẾN MÃI:
${promosText}`;
  }
}