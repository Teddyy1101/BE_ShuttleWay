import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { MessagesService } from './messages.service';
import { NotificationsService } from '../notifications/notifications.service';

@WebSocketGateway({ cors: true, namespace: '/chat' })
@UseGuards(WsJwtGuard)
export class ChatGateway {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly messagesService: MessagesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Tạo tên room chung cho 2 người (sắp xếp alphabet để đảm bảo tính nhất quán)
   */
  private getRoomName(userId1: string, userId2: string): string {
    const sorted = [userId1, userId2].sort();
    return `room_${sorted[0]}_${sorted[1]}`;
  }

  /**
   * Client tham gia phòng chat với một người khác
   */
  @SubscribeMessage('join_chat')
  async handleJoinChat(
    @MessageBody() data: { partnerId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    if (!user) {
      throw new WsException('Không xác định được người dùng');
    }

    const { partnerId } = data;
    const room = this.getRoomName(user.id, partnerId);

    client.join(room);

    return {
      event: 'joined_chat',
      data: { room, message: 'Đã kết nối phòng chat' },
    };
  }

  /**
   * Gửi tin nhắn: lưu DB → phát realtime tới room → push notification cho người nhận
   */
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: { receiverId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    if (!user) {
      throw new WsException('Không xác định được người dùng');
    }

    const { receiverId, content } = data;

    if (!receiverId || !content) {
      throw new WsException('Thiếu thông tin người nhận hoặc nội dung tin nhắn');
    }

    // Bước 1: Lưu tin nhắn vào database
    const newMessage = await this.messagesService.createMessage(
      user.id,
      receiverId,
      content,
    );

    // Bước 2: Lấy tên room chung
    const room = this.getRoomName(user.id, receiverId);

    // Bước 3: Phát sự kiện tới tất cả client trong room
    this.server.to(room).emit('receive_message', newMessage);

    // Bước 4: Fire-and-forget push notification cho người nhận
    const senderName = newMessage.sender?.fullName || 'Người dùng';
    const truncatedContent =
      content.length > 50 ? content.substring(0, 50) + '...' : content;

    this.notificationsService
      .sendPushNotification(
        receiverId,
        `${senderName} đã gửi tin nhắn`,
        truncatedContent,
      )
      .catch((err) =>
        this.logger.error('Lỗi gửi thông báo tin nhắn mới', err.message),
      );

    return {
      event: 'message_sent',
      data: newMessage,
    };
  }
}
