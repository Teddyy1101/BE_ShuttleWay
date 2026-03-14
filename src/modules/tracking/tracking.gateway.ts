import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Inject, Logger, UseGuards, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { TripsService } from '../trips/trips.service';

@WebSocketGateway({ cors: true, namespace: '/tracking' })
export class TrackingGateway {
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => TripsService))
    private readonly tripsService: TripsService,
  ) {}

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

  /**
   * Giả lập di chuyển xe buýt: phát tọa độ mỗi 2 giây qua WebSocket
   */
  startSimulation(
    tripId: string,
    coordinates: { lat: number; lng: number }[],
  ) {
    let index = 0;

    this.logger.log(
      `Bắt đầu giả lập chuyến đi ${tripId} với ${coordinates.length} điểm tọa độ`,
    );

    const interval = setInterval(() => {
      if (index >= coordinates.length) {
        clearInterval(interval);
        this.logger.log(`Hoàn thành giả lập chuyến đi ${tripId}`);
        this.server.to(tripId).emit('simulation_completed', {
          tripId,
          message: 'Giả lập chuyến đi đã hoàn thành',
        });
        return;
      }

      const { lat, lng } = coordinates[index];
      this.server.to(tripId).emit('location_updated', { tripId, lat, lng });
      this.logger.log(
        `Giả lập [${index + 1}/${coordinates.length}]: lat=${lat}, lng=${lng}`,
      );
      index++;
    }, 2000);
  }
}
