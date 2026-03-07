import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { StationsService } from './stations.service';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { ReorderStationsDto } from './dto/reorder-stations.dto';
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
  @ApiOperation({ summary: 'Create a new station (ADMIN only)' })
  create(@Body() createStationDto: CreateStationDto) {
    return this.stationsService.create(createStationDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Get all stations' })
  findAll() {
    return this.stationsService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Get a specific station by ID' })
  findOne(@Param('id') id: string) {
    return this.stationsService.findOne(id);
  }

  @Patch('reorder')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reorder stations simultaneously (ADMIN only)' })
  reorder(@Body() reorderDto: ReorderStationsDto) {
    return this.stationsService.reorder(reorderDto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a specific station (ADMIN only)' })
  update(@Param('id') id: string, @Body() updateStationDto: UpdateStationDto) {
    return this.stationsService.update(id, updateStationDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a specific station (Soft delete) (ADMIN only)' })
  remove(@Param('id') id: string) {
    return this.stationsService.remove(id);
  }
}
