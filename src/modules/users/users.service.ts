import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '../../../generated/prisma/enums';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private readonly selectWithoutPassword = {
    id: true,
    email: true,
    googleId: true,
    fullName: true,
    avatarUrl: true,
    phone: true,
    role: true,
    fcmToken: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  };

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findFirst({ where: { phone } });
  }

  async create(data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role: Role;
    avatarUrl?: string;
  }) {
    return this.prisma.user.create({ data });
  }

  async createAdmin(data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role: Role;
    avatarUrl?: string;
  }) {
    const existingEmail = await this.findByEmail(data.email);
    if (existingEmail) {
      throw new ConflictException('Email đã tồn tại trong hệ thống');
    }

    if (data.phone) {
      const existingPhone = await this.findByPhone(data.phone);
      if (existingPhone) {
        throw new ConflictException('Số điện thoại đã tồn tại trong hệ thống');
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
      select: this.selectWithoutPassword,
    });
    
    return { message: 'Thêm tài khoản thành công', result: user };
  }

  async updatePassword(userId: string, hashedPassword: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  async saveResetToken(userId: string, hashedToken: string, expires: Date) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: expires,
      },
    });
  }

  async findByResetToken(hashedToken: string) {
    return this.prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { gt: new Date() },
      },
    });
  }

  async clearResetToken(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });
  }

  // API CÁ NHÂN
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.selectWithoutPassword,
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return { message: 'Lấy thông tin cá nhân thành công', result: user };
  }

  async updateProfile(userId: string, dto: UpdateUserDto, avatarUrl?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.fcmToken !== undefined && { fcmToken: dto.fcmToken }),
        ...(avatarUrl && { avatarUrl }),
      },
      select: this.selectWithoutPassword,
    });

    return { message: 'Cập nhật thông tin thành công', result: updated };
  }

  // LIÊN KẾT PHỤ HUYNH - HỌC SINH
  async linkByPhone(callerId: string, callerRole: Role, phone: string) {
    let phoneLocal = phone;
    let phoneIntl = phone;
    if (phone.startsWith('+84')) {
      phoneLocal = '0' + phone.slice(3);
    } else if (phone.startsWith('0')) {
      phoneIntl = '+84' + phone.slice(1);
    }

    // Tìm user mục tiêu theo cả 2 dạng số điện thoại
    const targetUser = await this.prisma.user.findFirst({
      where: { phone: { in: [phoneLocal, phoneIntl] } },
    });
    if (!targetUser) {
      throw new NotFoundException('Không tìm thấy người dùng với số điện thoại này');
    }

    const expectedRole = callerRole === Role.STUDENT ? Role.PARENT : Role.STUDENT;
    if (targetUser.role !== expectedRole) {
      throw new BadRequestException(
        `Số điện thoại này không thuộc về tài khoản ${expectedRole === Role.PARENT ? 'phụ huynh' : 'học sinh'}`,
      );
    }
    const parentId = callerRole === Role.PARENT ? callerId : targetUser.id;
    const studentId = callerRole === Role.STUDENT ? callerId : targetUser.id;
    const existingLink = await this.prisma.parentStudent.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });
    if (existingLink) {
      throw new ConflictException('Liên kết giữa phụ huynh và học sinh này đã tồn tại');
    }

    const link = await this.prisma.parentStudent.create({
      data: { parentId, studentId },
    });

    const caller = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: { fullName: true },
    });

    // Fire-and-forget: Gửi thông báo in-app cho cả 2 bên
    const title = 'Liên kết tài khoản thành công';
    Promise.all([
      this.notificationsService.createInAppNotification(
        callerId,
        title,
        `Tài khoản của bạn đã được liên kết với ${targetUser.fullName}.`,
      ),
      this.notificationsService.createInAppNotification(
        targetUser.id,
        title,
        `Tài khoản của bạn đã được liên kết với ${caller?.fullName || 'người dùng'}.`,
      ),
    ]).catch((err) =>
      this.logger.error('Lỗi gửi thông báo liên kết', err.message),
    );

    return { message: 'Liên kết tài khoản thành công', result: link };
  }

  /**
   * Admin ghép thủ công bằng parentId và studentId
   */
  async adminLink(parentId: string, studentId: string) {
    // Kiểm tra parent tồn tại và đúng role
    const parent = await this.prisma.user.findUnique({ where: { id: parentId } });
    if (!parent) {
      throw new NotFoundException('Không tìm thấy phụ huynh');
    }
    if (parent.role !== Role.PARENT) {
      throw new BadRequestException('Tài khoản này không phải phụ huynh');
    }

    // Kiểm tra student tồn tại và đúng role
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!student) {
      throw new NotFoundException('Không tìm thấy học sinh');
    }
    if (student.role !== Role.STUDENT) {
      throw new BadRequestException('Tài khoản này không phải học sinh');
    }

    // Kiểm tra liên kết đã tồn tại chưa
    const existingLink = await this.prisma.parentStudent.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });
    if (existingLink) {
      throw new ConflictException('Liên kết giữa phụ huynh và học sinh này đã tồn tại');
    }

    const link = await this.prisma.parentStudent.create({
      data: { parentId, studentId },
    });

    // Fire-and-forget: Gửi thông báo in-app cho cả 2 bên
    const title = 'Liên kết tài khoản thành công';
    Promise.all([
      this.notificationsService.createInAppNotification(
        parentId,
        title,
        `Tài khoản của bạn đã được liên kết với ${student.fullName}.`,
      ),
      this.notificationsService.createInAppNotification(
        studentId,
        title,
        `Tài khoản của bạn đã được liên kết với ${parent.fullName}.`,
      ),
    ]).catch((err) =>
      this.logger.error('Lỗi gửi thông báo liên kết admin', err.message),
    );

    return { message: 'Liên kết tài khoản thành công', result: link };
  }

  /**
   * Admin hủy liên kết
   */
  async adminUnlink(parentId: string, studentId: string) {
    const existingLink = await this.prisma.parentStudent.findUnique({
      where: { parentId_studentId: { parentId, studentId } },
    });
    if (!existingLink) {
      throw new NotFoundException('Không tìm thấy liên kết giữa phụ huynh và học sinh này');
    }

    // Lấy tên cả 2 bên trước khi xóa liên kết
    const [parent, student] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: parentId },
        select: { fullName: true },
      }),
      this.prisma.user.findUnique({
        where: { id: studentId },
        select: { fullName: true },
      }),
    ]);

    await this.prisma.parentStudent.delete({
      where: { parentId_studentId: { parentId, studentId } },
    });

    // Gửi thông báo cho cả 2 bên
    const title = 'Hủy liên kết tài khoản';
    Promise.all([
      this.notificationsService.createInAppNotification(
        parentId,
        title,
        `Liên kết với học sinh ${student?.fullName || 'không xác định'} đã được hủy.`,
      ),
      this.notificationsService.createInAppNotification(
        studentId,
        title,
        `Liên kết với phụ huynh ${parent?.fullName || 'không xác định'} đã được hủy.`,
      ),
    ]).catch((err) =>
      this.logger.error('Lỗi gửi thông báo hủy liên kết', err.message),
    );

    return { message: 'Hủy liên kết thành công' };
  }

  /**
   * Lấy danh sách phụ huynh của học sinh
   */
  async getMyParents(studentId: string) {
    const links = await this.prisma.parentStudent.findMany({
      where: { studentId },
      include: {
        parent: {
          select: this.selectWithoutPassword,
        },
      },
    });

    return {
      message: 'Lấy danh sách phụ huynh thành công',
      result: links.map((link) => link.parent),
    };
  }

  /**
   * Lấy danh sách học sinh của phụ huynh
   */
  async getMyChildren(parentId: string) {
    const links = await this.prisma.parentStudent.findMany({
      where: { parentId },
      include: {
        student: {
          select: this.selectWithoutPassword,
        },
      },
    });

    return {
      message: 'Lấy danh sách học sinh thành công',
      result: links.map((link) => link.student),
    };
  }

  // API QUẢN TRỊ
  async findAll(query: QueryUsersDto) {
    const { role, search, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      ...(role && { role }),
    };

    // Tìm kiếm theo tên, email hoặc số điện thoại
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: this.selectWithoutPassword,
        skip,
        take: limit,
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' }
        ],
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách người dùng thành công',
      result: {
        data: users,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async findOneById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.selectWithoutPassword,
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return { message: 'Lấy thông tin người dùng thành công', result: user };
  }

  async adminUpdateUser(id: string, dto: UpdateUserDto, avatarUrl?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    // Kiểm tra phone trùng nếu thay đổi
    if (dto.phone && dto.phone !== user.phone) {
      const existingPhone = await this.findByPhone(dto.phone);
      if (existingPhone && existingPhone.id !== id) {
        throw new ConflictException('Số điện thoại đã tồn tại trong hệ thống');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.role && { role: dto.role as Role }),
        ...(avatarUrl && { avatarUrl }),
      },
      select: this.selectWithoutPassword,
    });

    return { message: 'Cập nhật người dùng thành công', result: updated };
  }

  async updateStatus(id: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: this.selectWithoutPassword,
    });

    return { message: 'Cập nhật trạng thái thành công', result: updated };
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Xóa người dùng thành công' };
  }
}
