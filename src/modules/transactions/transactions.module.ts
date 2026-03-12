import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [PrismaModule, ConfigModule, TicketsModule, PromotionsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
