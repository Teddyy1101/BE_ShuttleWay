import { Module, forwardRef } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [PrismaModule, NotificationsModule, forwardRef(() => TrackingModule)],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
