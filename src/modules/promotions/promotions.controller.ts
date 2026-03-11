import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { QueryPromotionsDto } from './dto/query-promotions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../../generated/prisma/client';

@ApiTags('Promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Tạo mã khuyến mãi mới (ADMIN)' })
  create(@Body() createPromotionDto: CreatePromotionDto) {
    return this.promotionsService.create(createPromotionDto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách mã khuyến mãi (phân trang, lọc) (ADMIN)' })
  findAll(@Query() query: QueryPromotionsDto) {
    return this.promotionsService.findAll(query);
  }

  @Get('active')
  @Roles(Role.PARENT)
  @ApiOperation({ summary: 'Lấy danh sách mã khuyến mãi đang có hiệu lực (PARENT)' })
  findActive(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.promotionsService.findActive(+page, +limit);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lấy chi tiết mã khuyến mãi theo ID (ADMIN)' })
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Cập nhật mã khuyến mãi (ADMIN)' })
  update(
    @Param('id') id: string,
    @Body() updatePromotionDto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(id, updatePromotionDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Xóa mã khuyến mãi (xóa mềm) (ADMIN)' })
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(id);
  }
}
