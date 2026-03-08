import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { StationsService } from './stations.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { ReorderStationsDto } from './dto/reorder-stations.dto';
import { QueryStationsDto } from './dto/query-stations.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../../generated/prisma/client';

@ApiTags('Stations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stations')
export class StationsController {
  constructor(private readonly stationsService: StationsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo trạm dừng mới (Chỉ dành cho ADMIN)' })
  create(@Body() createStationDto: CreateStationDto) {
    return this.stationsService.create(createStationDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy danh sách tất cả trạm dừng' })
  findAll(@Query() query: QueryStationsDto) {
    return this.stationsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy thông tin chi tiết trạm dừng theo ID' })
  findOne(@Param('id') id: string) {
    return this.stationsService.findOne(id);
  }

  @Patch('reorder')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật thứ tự các trạm dừng cùng lúc (Chỉ dành cho ADMIN)' })
  reorder(@Body() reorderDto: ReorderStationsDto) {
    return this.stationsService.reorder(reorderDto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật thông tin trạm dừng (Chỉ dành cho ADMIN)' })
  update(@Param('id') id: string, @Body() updateStationDto: UpdateStationDto) {
    return this.stationsService.update(id, updateStationDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa trạm dừng (Xóa mềm) (Chỉ dành cho ADMIN)' })
  remove(@Param('id') id: string) {
    return this.stationsService.remove(id);
  }
}
