import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { QueryRoutesDto } from './dto/query-routes.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, Direction, ShiftType } from '../../../generated/prisma/client';

@ApiTags('Routes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo tuyến đường mới (Chỉ dành cho ADMIN)' })
  create(@Body() createRouteDto: CreateRouteDto) {
    return this.routesService.create(createRouteDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy danh sách tất cả các tuyến đường' })
  findAll(@Query() query: QueryRoutesDto) {
    return this.routesService.findAll(query);
  }

  @Get(':routeCode')
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy chi tiết một tuyến đường theo routeCode (bao gồm các trạm đã sắp xếp)' })
  findOne(@Param('routeCode') routeCode: string) {
    return this.routesService.findOne(routeCode);
  }

  @Patch(':routeCode')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật thông tin tuyến đường (Chỉ dành cho ADMIN)' })
  update(@Param('routeCode') routeCode: string, @Body() updateRouteDto: UpdateRouteDto) {
    return this.routesService.update(routeCode, updateRouteDto);
  }

  @Delete(':routeCode')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa tuyến đường (Xóa mềm) (Chỉ dành cho ADMIN)' })
  remove(@Param('routeCode') routeCode: string) {
    return this.routesService.remove(routeCode);
  }
}
