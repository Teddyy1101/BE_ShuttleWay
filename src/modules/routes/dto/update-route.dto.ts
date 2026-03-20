import { PartialType } from '@nestjs/swagger';
import { CreateRouteDto } from './create-route.dto';

// Không cho phép cập nhật routeCode vì mã tuyến được sinh tự động
export class UpdateRouteDto extends PartialType(CreateRouteDto) {}
