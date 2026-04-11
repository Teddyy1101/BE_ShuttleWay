import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';

/**
 * WebSocket Gateway cho thông báo real-time.
 * Khi backend tạo thông báo mới, sẽ push tới client đang online
 */
@WebSocketGateway({ cors: true, namespace: '/notifications' })
export class NotificationGateway {
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server: Server;

  /**
   * Client tham gia room thông báo theo userId.
   * Mobile gọi sau khi login thành công.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join_notifications')
  handleJoinNotifications(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { userId } = data;
    const roomName = `user_${userId}`;
    client.join(roomName);

    return {
      event: 'joined_notifications',
      data: { message: 'Đã kết nối nhận thông báo real-time' },
    };
  }

  /**
   * Push thông báo mới tới user cụ thể (được gọi bởi NotificationsService).
   */
  sendToUser(userId: string, notification: Record<string, unknown>) {
    const roomName = `user_${userId}`;
    this.server.to(roomName).emit('new_notification', notification);
  }
}
