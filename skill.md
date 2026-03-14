# Kỹ năng và Code Mẫu (Skills & Snippets)

File này chứa các kỹ thuật chuẩn (Best Practices) và các đoạn code tái sử dụng cho dự án Hệ thống quản lý xe buýt. Agent AI bắt buộc phải tham khảo các pattern ở đây trước khi viết code mới.

## 1. Chuẩn hóa API Response (Global Interceptor)
Mọi API trả về cho app Flutter đều phải tuân theo định dạng: `{ statusCode, message, data }`.
**Cách làm:** Sử dụng `TransformInterceptor` cho toàn cục (Global).

```typescript
// src/common/interceptors/transform.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map(data => ({
        statusCode: context.switchToHttp().getResponse().statusCode,
        message: data?.message || 'Success',
        data: data?.result || data,
      })),
    );
  }
}
```

## 2. Kết nối Database (PrismaService)
Sử dụng class này để quản lý vòng đời kết nối với Supabase PostgreSQL.

```typescript
// src/core/prisma/prisma.service.ts
import { Injectable, OnModuleInit, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}
```

## 3. Xử lý Upload Ảnh (CloudinaryService)
Tuyệt đối không lưu file tạm. Nhận file từ Controller qua `@UploadedFile() file: Express.Multer.File` và truyền buffer xuống service này để đẩy thẳng lên Cloudinary.

```typescript
// src/modules/upload/cloudinary.service.ts
import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  uploadImageFromBuffer(file: Express.Multer.File): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'school_bus_management' },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        },
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }
}
```

## 4. Real-time Tracking (Socket.IO Gateway)
Sử dụng pattern này để tài xế phát tọa độ và broadcast cho phụ huynh/học sinh đang trong cùng một chuyến xe.

```typescript
// src/core/websockets/bus-tracking.gateway.ts
import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true, namespace: '/tracking' })
export class BusTrackingGateway {
  @WebSocketServer()
  server: Server;

  // Tài xế hoặc client (phụ huynh/học sinh) join vào room của chuyến đi
  @SubscribeMessage('joinRoute')
  handleJoinRoute(@MessageBody() routeId: string, @ConnectedSocket() client: Socket) {
    client.join(routeId);
    return { event: 'joined', data: `Joined route ${routeId}` };
  }

  // Tài xế gửi tọa độ mới -> Broadcast cho tất cả user đang join room đó
  @SubscribeMessage('updateLocation')
  handleUpdateLocation(@MessageBody() data: { routeId: string; lat: number; lng: number }) {
    this.server.to(data.routeId).emit('locationUpdated', {
      lat: data.lat,
      lng: data.lng,
      timestamp: new Date().toISOString(),
    });
  }
}
```