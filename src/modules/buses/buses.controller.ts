import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { BusesService } from './buses.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { QueryBusesDto } from './dto/query-buses.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, BusStatus } from '../../../generated/prisma/client';

@ApiTags('Buses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buses')
export class BusesController {
  constructor(private readonly busesService: BusesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo xe buýt mới (Chỉ dành cho ADMIN)' })
  create(@Body() createBusDto: CreateBusDto) {
    return this.busesService.create(createBusDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy danh sách tất cả xe buýt' })
  findAll(@Query() query: QueryBusesDto) {
    return this.busesService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy thông tin chi tiết xe buýt theo ID' })
  findOne(@Param('id') id: string) {
    return this.busesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật thông tin xe buýt (Chỉ dành cho ADMIN)' })
  update(@Param('id') id: string, @Body() updateBusDto: UpdateBusDto) {
    return this.busesService.update(id, updateBusDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa xe buýt (Xóa mềm - đặt isActive thành false) (Chỉ dành cho ADMIN)' })
  remove(@Param('id') id: string) {
    return this.busesService.remove(id);
  }
}
