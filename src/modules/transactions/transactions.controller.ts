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
import { TransactionsService } from './transactions.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../../generated/prisma/client';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('checkout')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Thanh toán vé xe (có thể áp mã khuyến mãi) (PARENT, STUDENT)' })
  checkout(
    @CurrentUser() currentUser: any,
    @Body() checkoutDto: CheckoutDto,
  ) {
    return this.transactionsService.checkout(currentUser, checkoutDto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách tất cả giao dịch (phân trang, lọc) (ADMIN)' })
  findAll(@Query() query: QueryTransactionsDto) {
    return this.transactionsService.findAll(query);
  }

  @Get('my-transactions')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Lấy lịch sử giao dịch của tôi (PARENT, STUDENT)' })
  getMyTransactions(
    @CurrentUser() currentUser: any,
    @Query() query: QueryTransactionsDto,
  ) {
    return this.transactionsService.getMyTransactions(currentUser, query);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật trạng thái thanh toán (SUCCESS/FAILED) (ADMIN)' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateTransactionStatusDto,
  ) {
    return this.transactionsService.updateStatus(id, updateStatusDto);
  }
}
