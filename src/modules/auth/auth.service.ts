import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { CloudinaryService } from '../upload/cloudinary.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import * as admin from 'firebase-admin';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto, file?: Express.Multer.File) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }
    if (dto.phone) {
      const existingPhone = await this.usersService.findByPhone(dto.phone);
      if (existingPhone) {
        throw new ConflictException('Số điện thoại đã được sử dụng');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    let avatarUrl: string | undefined;
    if (file) {
      avatarUrl = await this.cloudinaryService.uploadImageFromBuffer(file);
    }

    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role,
      avatarUrl,
    });

    const token = this.generateToken(user);

    return {
      message: 'Đăng ký thành công',
      result: {
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          avatarUrl: user.avatarUrl,
        },
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.password) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const token = this.generateToken(user);

    return {
      message: 'Đăng nhập thành công',
      result: {
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          avatarUrl: user.avatarUrl,
        },
      },
    };
  }

  async socialLogin(dto: SocialLoginDto) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(dto.idToken);
      const email = decodedToken.email;
      const uid = decodedToken.uid;
      const providerStr = decodedToken.firebase?.sign_in_provider || '';
      const provider = providerStr.includes('facebook') ? 'facebook' : 'google';

      if (!email) {
        throw new BadRequestException('Không thể lấy email từ tài khoản mạng xã hội');
      }

      let user = await this.usersService.findByEmail(email);

      if (user) {
        // Cập nhật googleId hoặc facebookId nếu chưa có
        if (provider === 'google' && !user.googleId) {
          await this.usersService.updateSocialId(user.id, 'google', uid);
        } else if (provider === 'facebook' && !user.facebookId) {
          await this.usersService.updateSocialId(user.id, 'facebook', uid);
        }

        const token = this.generateToken(user as any);
        return {
          message: 'Đăng nhập thành công',
          result: {
            accessToken: token,
            user: {
              id: user.id,
              email: user.email,
              fullName: user.fullName,
              role: user.role,
              avatarUrl: user.avatarUrl,
            },
          },
        };
      } else {
        // User mới
        if (!dto.role || !dto.phone) {
          // Trả về 202 Accepted để báo Mobile cần thu thập thêm role và phone
          return {
            requiresAdditionalInfo: true,
            message: 'Vui lòng cung cấp thêm vai trò và số điện thoại để hoàn tất đăng ký',
            email: email,
            fullName: decodedToken.name || 'Người dùng',
          };
        }

        const existingPhone = await this.usersService.findByPhone(dto.phone);
        if (existingPhone) {
          throw new ConflictException('Số điện thoại đã được sử dụng');
        }

        const newUser = await this.usersService.create({
          email: email,
          password: '', // Không dùng password
          fullName: decodedToken.name || 'Người dùng mới',
          phone: dto.phone,
          role: dto.role,
          avatarUrl: decodedToken.picture,
        });

        await this.usersService.updateSocialId(newUser.id, provider, uid);

        const token = this.generateToken(newUser as any);
        return {
          message: 'Đăng ký và đăng nhập thành công',
          result: {
            accessToken: token,
            user: {
              id: newUser.id,
              email: newUser.email,
              fullName: newUser.fullName,
              role: newUser.role,
              avatarUrl: newUser.avatarUrl,
            },
          },
        };
      }
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (error instanceof BadRequestException) throw error;
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }
  }

  // ĐỔI MẬT KHẨU

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.password) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const isOldPasswordValid = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }

    const hashedNewPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.updatePassword(userId, hashedNewPassword);

    return { message: 'Đổi mật khẩu thành công' };
  }

  // QUÊN MẬT KHẨU — Tạo mật khẩu mới và gửi qua email

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    // Luôn trả message giống nhau để tránh leak thông tin user
    if (!user) {
      return { message: 'Nếu email tồn tại trong hệ thống, mật khẩu mới sẽ được gửi đến email của bạn' };
    }

    // Sinh mật khẩu mới ngẫu nhiên (8 ký tự)
    const newPassword = crypto.randomBytes(4).toString('hex'); // 8 ký tự hex

    // Hash và cập nhật vào DB
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(user.id, hashedPassword);

    // Gửi email chứa mật khẩu mới
    try {
      await this.mailService.sendNewPasswordEmail(
        user.email,
        user.fullName,
        newPassword,
      );
    } catch (error) {
      console.error('Gửi email thất bại:', error.message);
      throw new BadRequestException('Không thể gửi email. Vui lòng thử lại sau');
    }

    return { message: 'Mật khẩu mới đã được gửi đến email của bạn' };
  }

  // ĐẶT LẠI MẬT KHẨU

  async resetPassword(dto: ResetPasswordDto) {
    // Hash token từ request để so sánh với DB
    const hashedToken = crypto.createHash('sha256').update(dto.token).digest('hex');

    const user = await this.usersService.findByResetToken(hashedToken);
    if (!user) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn');
    }

    const hashedNewPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.updatePassword(user.id, hashedNewPassword);
    await this.usersService.clearResetToken(user.id);

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  private generateToken(user: { id: string; email: string; role: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload);
  }
}
