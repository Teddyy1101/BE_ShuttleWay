import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as path from 'path';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
      tls: {
        rejectUnauthorized: false, // Fix "self-signed certificate in certificate chain"
      },
    });
  }

  /**
   * Gửi email chứa mật khẩu mới cho user khi quên mật khẩu.
   */
  async sendNewPasswordEmail(
    to: string,
    fullName: string,
    newPassword: string,
  ): Promise<void> {
    const appName = 'ShuttleWay';
    const subject = `[${appName}] Mật khẩu mới của bạn`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa; }
          .container { max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #0F172A, #1E293B); padding: 28px 24px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
          .header p { color: #94A3B8; margin: 4px 0 0; font-size: 13px; font-weight: 500; }
          .body { padding: 32px 24px; }
          .body p { color: #333; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
          .password-box { background: #f0f4ff; border: 2px dashed #4285F4; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0; }
          .password-box .label { font-size: 12px; color: #666; margin-bottom: 8px; }
          .password-box .password { font-size: 24px; font-weight: 700; color: #1a73e8; letter-spacing: 2px; font-family: 'Courier New', monospace; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; border-radius: 4px; margin: 16px 0; }
          .warning p { color: #856404; font-size: 13px; margin: 0; }
          .footer { padding: 20px 24px; text-align: center; border-top: 1px solid #eee; }
          .footer p { color: #999; font-size: 12px; margin: 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div style="margin-bottom: 8px;">
              <img src="cid:app_icon" alt="ShuttleWay Logo" style="width: 48px; height: 48px; border-radius: 10px; vertical-align: middle; margin-right: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);" />
              <h1 style="display: inline-block; vertical-align: middle; margin: 0;">${appName}</h1>
            </div>
            <p>Hệ thống xe buýt trường học thông minh</p>
          </div>
          <div class="body">
            <p>Xin chào <strong>${fullName}</strong>,</p>
            <p>Chúng tôi đã nhận được yêu cầu khôi phục mật khẩu cho tài khoản của bạn. Mật khẩu mới của bạn là:</p>
            <div class="password-box">
              <div class="label">MẬT KHẨU MỚI</div>
              <div class="password">${newPassword}</div>
            </div>
            <div class="warning">
              <p>⚠️ Vui lòng đăng nhập và đổi mật khẩu ngay sau khi nhận được email này để bảo mật tài khoản.</p>
            </div>
            <p>Nếu bạn không yêu cầu khôi phục mật khẩu, vui lòng bỏ qua email này hoặc liên hệ hỗ trợ.</p>
          </div>
          <div class="footer">
            <p>© 2026 ${appName}. Email này được gửi tự động, vui lòng không trả lời.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.transporter.sendMail({
      from: `"${appName}" <${this.configService.get<string>('MAIL_USER')}>`,
      to,
      subject,
      html,
      attachments: [
        {
          filename: 'app_icon.png',
          path: path.join(process.cwd(), 'assets', 'images', 'app_icon.png'),
          cid: 'app_icon' 
        }
      ]
    });
  }
}
