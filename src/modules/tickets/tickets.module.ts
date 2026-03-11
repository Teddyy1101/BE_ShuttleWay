import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { RoutesModule } from '../routes/routes.module';

@Module({
  imports: [PrismaModule, RoutesModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
