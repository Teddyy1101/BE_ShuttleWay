import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Create a new route (ADMIN only)' })
  create(@Body() createRouteDto: CreateRouteDto) {
    return this.routesService.create(createRouteDto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Get all routes' })
  @ApiQuery({ name: 'shiftType', enum: ShiftType, required: false })
  @ApiQuery({ name: 'direction', enum: Direction, required: false })
  @ApiQuery({ name: 'isActive', type: Boolean, required: false })
  findAll(
    @Query('shiftType') shiftType?: ShiftType,
    @Query('direction') direction?: Direction,
    @Query('isActive') isActiveStr?: string,
  ) {
    let isActive: boolean | undefined = undefined;
    if (isActiveStr !== undefined) {
      isActive = isActiveStr === 'true';
    }
    return this.routesService.findAll(shiftType, direction, isActive);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.DRIVER, Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Get a specific route by ID (includes ordered stations)' })
  findOne(@Param('id') id: string) {
    return this.routesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a specific route (ADMIN only)' })
  update(@Param('id') id: string, @Body() updateRouteDto: UpdateRouteDto) {
    return this.routesService.update(id, updateRouteDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a specific route (Soft delete) (ADMIN only)' })
  remove(@Param('id') id: string) {
    return this.routesService.remove(id);
  }
}
