import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiConsumes,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CloudinaryService } from '../upload/cloudinary.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { LinkByPhoneDto } from './dto/link-by-phone.dto';
import { AdminLinkDto } from './dto/admin-link.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../../generated/prisma/enums';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // API CÁ NHÂN
  @Get('me')
  @ApiOperation({ summary: 'Lấy thông tin cá nhân của user đang đăng nhập' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({ summary: 'Cập nhật thông tin cá nhân (hỗ trợ upload ảnh đại diện)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', example: 'Nguyễn Văn B' },
        phone: { type: 'string', example: '0987654321' },
        avatarUrl: { type: 'string', format: 'binary', description: 'File ảnh đại diện' },
      },
    },
  })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let avatarUrl: string | undefined;
    if (file) {
      avatarUrl = await this.cloudinaryService.uploadImageFromBuffer(file);
    }
    return this.usersService.updateProfile(userId, dto, avatarUrl);
  }

  // LIÊN KẾT PHỤ HUYNH - HỌC SINH

  @Post('link-parent')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Học sinh liên kết với phụ huynh qua số điện thoại' })
  async linkParent(
    @CurrentUser('id') studentId: string,
    @Body() dto: LinkByPhoneDto,
  ) {
    return this.usersService.linkByPhone(studentId, Role.STUDENT, dto.phone);
  }

  @Get('my-parents')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Lấy danh sách phụ huynh của học sinh đang đăng nhập' })
  async getMyParents(@CurrentUser('id') studentId: string) {
    return this.usersService.getMyParents(studentId);
  }

  @Post('link-student')
  @Roles(Role.PARENT)
  @ApiOperation({ summary: 'Phụ huynh liên kết với học sinh qua số điện thoại' })
  async linkStudent(
    @CurrentUser('id') parentId: string,
    @Body() dto: LinkByPhoneDto,
  ) {
    return this.usersService.linkByPhone(parentId, Role.PARENT, dto.phone);
  }

  @Get('my-children')
  @Roles(Role.PARENT)
  @ApiOperation({ summary: 'Lấy danh sách học sinh của phụ huynh đang đăng nhập' })
  async getMyChildren(@CurrentUser('id') parentId: string) {
    return this.usersService.getMyChildren(parentId);
  }

  @Delete('unlink-parent/:parentId')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Học sinh hủy liên kết với phụ huynh' })
  @ApiParam({ name: 'parentId', description: 'UUID của phụ huynh cần hủy liên kết' })
  async unlinkParent(
    @CurrentUser('id') studentId: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
  ) {
    return this.usersService.adminUnlink(parentId, studentId);
  }

  @Delete('unlink-student/:studentId')
  @Roles(Role.PARENT)
  @ApiOperation({ summary: 'Phụ huynh hủy liên kết với học sinh' })
  @ApiParam({ name: 'studentId', description: 'UUID của học sinh cần hủy liên kết' })
  async unlinkStudent(
    @CurrentUser('id') parentId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.usersService.adminUnlink(parentId, studentId);
  }

  @Post('admin/link')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin ghép liên kết phụ huynh - học sinh thủ công' })
  async adminLink(@Body() dto: AdminLinkDto) {
    return this.usersService.adminLink(dto.parentId, dto.studentId);
  }

  @Delete('admin/unlink')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin hủy liên kết phụ huynh - học sinh' })
  @ApiQuery({ name: 'parentId', description: 'UUID của phụ huynh' })
  @ApiQuery({ name: 'studentId', description: 'UUID của học sinh' })
  async adminUnlink(
    @Query('parentId', ParseUUIDPipe) parentId: string,
    @Query('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.usersService.adminUnlink(parentId, studentId);
  }

  // API QUẢN TRỊ (Admin)

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách user (hỗ trợ lọc theo role, phân trang)' })
  async findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Post()
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({ summary: 'Admin tạo mới user (hỗ trợ upload avatar)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        password: { type: 'string' },
        role: { type: 'string', enum: Object.values(Role) },
        avatar: { type: 'string', format: 'binary' },
      },
    },
  })
  async createUser(
    @Body() dto: CreateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let avatarUrl: string | undefined;
    if (file) {
      avatarUrl = await this.cloudinaryService.uploadImageFromBuffer(file);
    }
    return this.usersService.createAdmin({ ...dto, avatarUrl });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một user theo ID' })
  @ApiParam({ name: 'id', description: 'UUID của user' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOneById(id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Khóa / Mở khóa tài khoản' })
  @ApiParam({ name: 'id', description: 'UUID của user' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(id, dto.isActive);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa một user khỏi database' })
  @ApiParam({ name: 'id', description: 'UUID của user' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
