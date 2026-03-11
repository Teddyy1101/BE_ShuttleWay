import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { QueryPromotionsDto } from './dto/query-promotions.dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPromotionDto: CreatePromotionDto) {
    const { validFrom, validUntil, ...rest } = createPromotionDto;

    // Kiểm tra ngày hết hạn phải sau ngày bắt đầu
    if (new Date(validUntil) <= new Date(validFrom)) {
      throw new BadRequestException(
        'Ngày hết hạn phải sau ngày bắt đầu hiệu lực',
      );
    }

    return this.prisma.promotion.create({
      data: {
        ...rest,
        validFrom: new Date(validFrom),
        validUntil: new Date(validUntil),
      },
    });
  }

  async findAll(query: QueryPromotionsDto) {
    const { discountType, isActive, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (discountType) where.discountType = discountType;
    if (isActive !== undefined) where.isActive = isActive;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.promotion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.promotion.count({ where }),
    ]);

    return {
      message: 'Lấy danh sách mã khuyến mãi thành công',
      result: {
        data: items,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async findOne(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
    });
    if (!promotion) {
      throw new NotFoundException(`Không tìm thấy mã khuyến mãi với ID ${id}`);
    }
    return promotion;
  }

  /**
   * Tìm mã khuyến mãi theo code, kiểm tra tính hợp lệ
   */
  async findValidByCode(code: string) {
    const now = new Date();
    const promotion = await this.prisma.promotion.findUnique({
      where: { code },
    });

    if (!promotion) {
      throw new NotFoundException(
        `Không tìm thấy mã khuyến mãi với code "${code}"`,
      );
    }

    if (!promotion.isActive) {
      throw new BadRequestException('Mã khuyến mãi đã bị vô hiệu hóa');
    }

    if (now < promotion.validFrom || now > promotion.validUntil) {
      throw new BadRequestException('Mã khuyến mãi đã hết hạn hoặc chưa đến thời gian sử dụng');
    }

    if (
      promotion.usageLimit !== null &&
      promotion.usedCount >= promotion.usageLimit
    ) {
      throw new BadRequestException('Mã khuyến mãi đã hết lượt sử dụng');
    }

    return promotion;
  }

  async update(id: string, updatePromotionDto: UpdatePromotionDto) {
    await this.findOne(id);

    const data: any = { ...updatePromotionDto };
    if (updatePromotionDto.validFrom) {
      data.validFrom = new Date(updatePromotionDto.validFrom);
    }
    if (updatePromotionDto.validUntil) {
      data.validUntil = new Date(updatePromotionDto.validUntil);
    }

    return this.prisma.promotion.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.promotion.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Lấy danh sách mã khuyến mãi đang có hiệu lực (cho Phụ huynh / Học sinh)
   */
  async findActive(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const now = new Date();

    const whereActive = {
      isActive: true,
      validFrom: { lte: now },
      validUntil: { gte: now },
    };

    const [allItems, totalBeforeFilter] = await this.prisma.$transaction([
      this.prisma.promotion.findMany({
        where: whereActive,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.promotion.count({ where: whereActive }),
    ]);

    // Lọc thêm điều kiện usedCount < usageLimit ở tầng application
    const filtered = allItems.filter(
      (p) => p.usageLimit === null || p.usedCount < p.usageLimit,
    );

    const total = filtered.length;
    const items = filtered.slice(skip, skip + limit);

    return {
      message: 'Lấy danh sách mã khuyến mãi đang hiệu lực thành công',
      result: {
        data: items,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }
}
