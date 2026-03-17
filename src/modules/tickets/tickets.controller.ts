import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { AdminQueryTicketsDto } from './dto/admin-query-tickets.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../../generated/prisma/client';

@ApiTags('Tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách toàn bộ vé (phân trang, lọc, tìm kiếm) (ADMIN)' })
  findAll(@Query() query: AdminQueryTicketsDto) {
    return this.ticketsService.findAllAdmin(query);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Hủy vé theo ID (ADMIN)' })
  cancelTicket(@Param('id') id: string) {
    return this.ticketsService.cancelTicket(id);
  }

  @Post()
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Mua vé xe (PARENT, STUDENT)' })
  buyTicket(
    @CurrentUser() currentUser: any,
    @Body() createTicketDto: CreateTicketDto,
  ) {
    return this.ticketsService.buyTicket(currentUser, createTicketDto);
  }

  @Get('my-tickets')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy danh sách vé của tôi (phân trang, lọc) (PARENT, STUDENT)' })
  getMyTickets(
    @CurrentUser() currentUser: any,
    @Query() query: QueryTicketsDto,
  ) {
    return this.ticketsService.getMyTickets(currentUser, query);
  }
}

