import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { LeaveStatus, AttendanceStatus } from '../../../generated/prisma/client';

@Injectable()
export class LeaveRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tạo đơn xin nghỉ mới
   */
  async create(dto: CreateLeaveRequestDto) {
    await this.validateStudentAndParent(dto.studentId, dto.parentId);

    const leaveRequest = await this.prisma.leaveRequest.create({
      data: {
        studentId: dto.studentId,
        parentId: dto.parentId,
        fromDate: new Date(dto.fromDate),
        toDate: new Date(dto.toDate),
        reason: dto.reason,
      },
      include: {
        student: {
          select: { id: true, fullName: true, email: true },
        },
        parent: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return {
      message: 'Tạo đơn xin nghỉ thành công',
      result: leaveRequest,
    };
  }

  /**
   * Lấy danh sách đơn xin nghỉ (phân trang, lọc, tìm kiếm)
   */
  async findAll(query: QueryLeaveRequestsDto) {
    const { status, studentId, search, fromDate, toDate, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (studentId) where.studentId = studentId;

    // Tìm kiếm theo tên học sinh
    if (search) {
      where.student = {
        fullName: { contains: search, mode: 'insensitive' },
      };
    }

    // Lọc theo khoảng thời gian nghỉ
    if (fromDate || toDate) {
      where.fromDate = {};
      if (fromDate) where.fromDate.gte = new Date(fromDate);
      if (toDate) where.fromDate.lte = new Date(toDate);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              avatarUrl: true,
              // Lấy danh sách vé active để biết tuyến xe học sinh đang đi
              studentTickets: {
                where: { status: 'ACTIVE' },
                select: {
                  route: { select: { id: true, name: true, routeCode: true } },
                },
                take: 5,
              },
            },
          },
          parent: {
            select: { id: true, fullName: true, phone: true },
          },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách đơn xin nghỉ thành công',
      result: {
        data: items,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Lấy chi tiết 1 đơn xin nghỉ
   */
  async findOne(id: string) {
    const leaveRequest = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            avatarUrl: true,
            studentTickets: {
              where: { status: 'ACTIVE' },
              select: {
                route: { select: { id: true, name: true, routeCode: true } },
              },
              take: 5,
            },
          },
        },
        parent: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
      },
    });

    if (!leaveRequest) {
      throw new NotFoundException(`Không tìm thấy đơn xin nghỉ với ID ${id}`);
    }

    return {
      message: 'Lấy chi tiết đơn xin nghỉ thành công',
      result: leaveRequest,
    };
  }

  /**
   * Cập nhật trạng thái đơn xin nghỉ (Duyệt / Từ chối)
   * Nếu APPROVED → cập nhật TripAttendance thành ABSENT
   */
  async updateStatus(id: string, dto: UpdateLeaveStatusDto) {
    const leaveRequest = await this.prisma.leaveRequest.findUnique({
      where: { id },
    });

    if (!leaveRequest) {
      throw new NotFoundException(`Không tìm thấy đơn xin nghỉ với ID ${id}`);
    }

    if (leaveRequest.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Đơn xin nghỉ này đã được xử lý trước đó');
    }

    // Sử dụng transaction để đảm bảo tính toàn vẹn dữ liệu
    const updatedRequest = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: { status: dto.status },
        include: {
          student: {
            select: { id: true, fullName: true, email: true },
          },
          parent: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      // Nếu duyệt đơn → cập nhật điểm danh thành ABSENT
      if (dto.status === LeaveStatus.APPROVED) {
        await this.markAttendancesAsAbsent(
          tx,
          leaveRequest.studentId,
          leaveRequest.fromDate,
          leaveRequest.toDate,
        );
      }

      return updated;
    });

    const statusText = dto.status === LeaveStatus.APPROVED ? 'duyệt' : 'từ chối';

    return {
      message: `Đã ${statusText} đơn xin nghỉ thành công`,
      result: updatedRequest,
    };
  }

  // ========================
  // PRIVATE HELPER METHODS
  // ========================

  /**
   * Kiểm tra học sinh và phụ huynh tồn tại
   */
  private async validateStudentAndParent(studentId: string, parentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException(`Không tìm thấy học sinh với ID ${studentId}`);
    }

    const parent = await this.prisma.user.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      throw new NotFoundException(`Không tìm thấy phụ huynh với ID ${parentId}`);
    }
  }

  /**
   * Cập nhật tất cả bản ghi điểm danh của học sinh trong khoảng thời gian nghỉ thành ABSENT
   */
  private async markAttendancesAsAbsent(
    tx: any,
    studentId: string,
    fromDate: Date,
    toDate: Date,
  ) {
    await tx.tripAttendance.updateMany({
      where: {
        studentId,
        status: { not: AttendanceStatus.ABSENT },
        trip: {
          scheduledDate: {
            gte: fromDate,
            lte: toDate,
          },
        },
      },
      data: {
        status: AttendanceStatus.ABSENT,
      },
    });
  }
}
