import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { MessagesService } from './messages.service';

@WebSocketGateway({ cors: true, namespace: '/chat' })
@UseGuards(WsJwtGuard)
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly messagesService: MessagesService) {}

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
   * Gửi tin nhắn: lưu DB → phát realtime tới room
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

    return {
      event: 'message_sent',
      data: newMessage,
    };
  }
}
