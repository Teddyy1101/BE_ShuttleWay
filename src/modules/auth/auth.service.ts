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
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly cloudinaryService: CloudinaryService,
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
        },
      },
    };
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

  // QUÊN MẬT KHẨU

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    // Luôn trả về message thành công để tránh leak thông tin user tồn tại hay không
    if (!user) {
      return { message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu' };
    }

    // Sinh token ngẫu nhiên
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Hash token trước khi lưu DB
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Hạn sử dụng: 15 phút
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await this.usersService.saveResetToken(user.id, hashedToken, expires);

    // Tạm thời console.log token (trước khi tích hợp gửi email)
    console.log('===== RESET PASSWORD TOKEN =====');
    console.log(`Email: ${user.email}`);
    console.log(`Token: ${rawToken}`);
    console.log(`Hết hạn: ${expires.toISOString()}`);
    console.log('================================');

    return { message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu' };
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
