import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TrackingGateway } from './tracking.gateway';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [
    forwardRef(() => TripsModule),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [TrackingGateway, WsJwtGuard],
  exports: [TrackingGateway],
})
export class TrackingModule {}
