import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { BusesModule } from './modules/buses/buses.module';
import { StationsModule } from './modules/stations/stations.module';
import { RoutesModule } from './modules/routes/routes.module';
import { TripsModule } from './modules/trips/trips.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { MessagesModule } from './modules/messages/messages.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { FirebaseModule } from './core/firebase/firebase.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CronModule } from './modules/cron/cron.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    FirebaseModule,
    UsersModule,
    AuthModule,
    BusesModule,
    StationsModule,
    RoutesModule,
    TripsModule,
    TrackingModule,
    MessagesModule,
    PromotionsModule,
    TicketsModule,
    TransactionsModule,
    NotificationsModule,
    CronModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
