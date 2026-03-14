import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService
        .get<string>('FIREBASE_PRIVATE_KEY')
        ?.replace(/\\n/g, '\n');

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      this.logger.log('Firebase Admin SDK đã được khởi tạo thành công');
    }
  }

  /**
   * Gửi thông báo FCM có notification (hiện popup màn hình khóa + rung)
   * @returns true nếu gửi thành công, false nếu thất bại
   */
  async sendNotification(
    token: string,
    title: string,
    body: string,
  ): Promise<boolean> {
    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
      });
      this.logger.log(`Gửi FCM thành công đến token: ${token.substring(0, 20)}...`);
      return true;
    } catch (error) {
      this.logger.warn(
        `Gửi FCM thất bại đến token: ${token.substring(0, 20)}... - Lỗi: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Gửi FCM Data Message (silent push - không hiện popup, không rung)
   * Chỉ chứa trường data, KHÔNG có trường notification
   * Dùng để báo hiệu cho app reload danh sách thông báo
   * @returns true nếu gửi thành công, false nếu thất bại
   */
  async sendDataMessage(
    token: string,
    data: Record<string, string>,
  ): Promise<boolean> {
    try {
      await admin.messaging().send({
        token,
        data,
      });
      this.logger.log(`Gửi FCM Data Message thành công đến token: ${token.substring(0, 20)}...`);
      return true;
    } catch (error) {
      this.logger.warn(
        `Gửi FCM Data Message thất bại đến token: ${token.substring(0, 20)}... - Lỗi: ${error.message}`,
      );
      return false;
    }
  }
}
