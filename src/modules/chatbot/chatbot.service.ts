import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ChatbotAskDto } from './dto/chatbot-ask.dto';
import axios from 'axios';

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
   * Xử lý câu hỏi của người dùng:
   * 1. Thu thập dữ liệu context từ DB → plain text
   * 2. Xây dựng system prompt + bơm data
   * 3. Gọi Ollama API với history
   * 4. Trả về câu trả lời
   */
  async ask(currentUser: any, dto: ChatbotAskDto): Promise<{ reply: string }> {
    try {
      // Bước 1: Thu thập dữ liệu context từ Database (plain text)
      const [routesText, ticketsText] = await Promise.all([
        this.getActiveRoutes(),
        this.getUserTickets(currentUser),
      ]);

      // Bước 2: Xây dựng system instruction (kèm role)
      const userRole = currentUser.role === 'PARENT' ? 'phụ huynh' : 'học sinh';
      const systemInstruction = this.buildSystemInstruction(
        routesText,
        ticketsText,
        userRole,
      );

      // Bước 3: Xây dựng mảng messages cho Ollama
      const messages: { role: string; content: string }[] = [
        { role: 'system', content: systemInstruction },
      ];

      for (const msg of dto.history) {
        messages.push({
          role: msg.role === 'model' ? 'assistant' : msg.role,
          content: msg.content,
        });
      }

      // Thêm tin nhắn hiện tại của user
      messages.push({ role: 'user', content: dto.message });

      // Bước 4: Gọi Ollama API
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
   * Gọi Ollama REST API (POST /api/chat) — non-streaming.
   * Timeout 120s để đảm bảo model có đủ thời gian generate trên CPU.
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
   * Lấy tất cả tuyến đường active — trả về plain text dễ đọc cho LLM.
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
    });

    if (routes.length === 0) return 'Hiện chưa có tuyến đường nào.';

    return routes
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
  }

  /**
   * Lấy danh sách vé của user hiện tại — trả về plain text.
   */
  private async getUserTickets(currentUser: any): Promise<string> {
    const where: any = { isActive: true };

    if (currentUser.role === 'STUDENT') {
      where.studentId = currentUser.id;
    } else if (currentUser.role === 'PARENT') {
      where.parentId = currentUser.id;
    } else {
      return 'Không có vé.';
    }

    const tickets = await this.prisma.ticket.findMany({
      where,
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
      take: 5,
    });

    if (tickets.length === 0) return 'Người dùng chưa có vé nào.';

    return tickets
      .map((t, i) => {
        const loai = t.ticketType === 'MONTHLY' ? 'Vé tháng' : 'Vé lượt';
        const from = new Date(t.validFrom).toLocaleDateString('vi-VN');
        const until = new Date(t.validUntil).toLocaleDateString('vi-VN');
        return `Vé ${i + 1}: ${loai}, tuyến ${t.route?.name ?? 'N/A'}, trạng thái ${t.status}, giá ${t.priceAtBuy.toLocaleString('vi-VN')}đ, hiệu lực ${from} - ${until}, học sinh ${t.student?.fullName ?? 'N/A'}`;
      })
      .join('\n');
  }

  /**
   * Xây dựng system instruction cho AI — plain text format.
   * Bao gồm hướng dẫn chi tiết cho từng loại câu hỏi.
   */
  private buildSystemInstruction(
    routesText: string,
    ticketsText: string,
    userRole: string,
  ): string {
    return `Bạn là trợ lý tư vấn AI của ShuttleWay — hệ thống xe buýt trường học thông minh.
Khi được hỏi "bạn là ai", trả lời: "Tôi là trợ lý tư vấn của ShuttleWay, sẵn sàng giúp bạn giải đáp thắc mắc về tuyến xe, giá vé, trạm dừng và lịch trình."

Người dùng hiện tại là: ${userRole}.

QUY TẮC:
- Trả lời tiếng Việt, lịch sự, ngắn gọn.
- CHỈ dùng dữ liệu bên dưới, KHÔNG bịa, KHÔNG đề cập đến website hay link nào.
- Khi được yêu cầu "liệt kê tuyến đường" hoặc "có những tuyến đường nào", trả lời theo mẫu:
  "Hiện tại ShuttleWay có X tuyến đường:
  1. Tên tuyến (Mã tuyến) - Ca sáng/chiều
  2. Tên tuyến (Mã tuyến) - Ca sáng/chiều
  ..."
  Chỉ liệt kê tên và mã, KHÔNG kèm giá vé hay trạm dừng trừ khi người dùng hỏi thêm.
- Khi hỏi chi tiết 1 tuyến cụ thể: nêu đầy đủ tên, mã, ca, giờ khởi hành, giá vé lượt + tháng, và các trạm.
- Khi hỏi giá vé tháng chung: tính trung bình cộng giá vé tháng các tuyến rồi trả lời "khoảng Xđ tùy tuyến".
- Khi hỏi tuyến nào đi qua trường/trạm cụ thể: tìm trong danh sách trạm, nếu không rõ trường nào thì hỏi lại "Bạn muốn biết tuyến đi qua trường nào ạ?".
- Khi hỏi "vé của tôi còn hạn không":
  + Nếu người dùng là phụ huynh và có nhiều vé: hỏi lại "Bạn muốn kiểm tra vé của học sinh nào ạ?" rồi liệt kê các vé kèm tên học sinh, tuyến, trạng thái và ngày hết hạn.
  + Nếu chỉ có 1 vé: trả lời luôn trạng thái và hạn của vé đó.
- Nếu không tìm thấy thông tin: nói "Hiện tại tôi chưa có thông tin này, bạn vui lòng liên hệ hotline để được hỗ trợ thêm ạ."

DANH SÁCH TUYẾN ĐƯỜNG HIỆN CÓ:
${routesText}

VÉ CỦA NGƯỜI DÙNG:
${ticketsText}`;
  }
}
