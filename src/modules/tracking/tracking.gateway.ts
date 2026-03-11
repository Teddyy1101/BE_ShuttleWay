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
import { TripsService } from '../trips/trips.service';

@WebSocketGateway({ cors: true, namespace: '/tracking' })
export class TrackingGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly tripsService: TripsService) {}

  /**
   * Client tham gia theo dõi chuyến xe theo tripId
   */
  @SubscribeMessage('join_trip')
  async handleJoinTrip(
    @MessageBody() data: { tripId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { tripId } = data;

    // Validate chuyến đi tồn tại
    try {
      await this.tripsService.findOne(tripId);
    } catch {
      throw new WsException('Chuyến đi không tồn tại');
    }

    // Cho client join vào room có tên là tripId
    client.join(tripId);

    return {
      event: 'joined',
      data: { message: 'Đã tham gia theo dõi chuyến xe' },
    };
  }

  /**
   * Tài xế gửi cập nhật vị trí, phát tới tất cả client trong room
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('update_location')
  async handleUpdateLocation(
    @MessageBody() data: { tripId: string; lat: number; lng: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;

    // Chỉ tài xế mới được gửi cập nhật vị trí
    if (!user || user.role !== 'DRIVER') {
      throw new WsException('Chỉ tài xế mới được cập nhật vị trí');
    }

    const { tripId, lat, lng } = data;

    // Phát tọa độ mới cho tất cả người trong room
    this.server.to(tripId).emit('location_updated', { tripId, lat, lng });

    return {
      event: 'location_updated',
      data: { message: 'Đã cập nhật vị trí thành công' },
    };
  }
}
