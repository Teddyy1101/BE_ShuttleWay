import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
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

  @Post()
  @Roles(Role.PARENT)
  @ApiOperation({ summary: 'Mua vé xe cho học sinh (PARENT)' })
  buyTicket(
    @CurrentUser('id') parentId: string,
    @Body() createTicketDto: CreateTicketDto,
  ) {
    return this.ticketsService.buyTicket(parentId, createTicketDto);
  }

  @Get('my-tickets')
  @Roles(Role.PARENT)
  @ApiOperation({ summary: 'Lấy danh sách vé đã mua (phân trang, lọc) (PARENT)' })
  getMyTickets(
    @CurrentUser('id') parentId: string,
    @Query() query: QueryTicketsDto,
  ) {
    return this.ticketsService.getMyTickets(parentId, query);
  }
}
