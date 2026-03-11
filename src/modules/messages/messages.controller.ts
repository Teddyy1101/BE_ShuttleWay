import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { PaginationDto } from './dto/pagination.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get(':partnerId')
  @ApiOperation({ summary: 'Lấy lịch sử chat với một người (phân trang, mới nhất lên đầu)' })
  getChatHistory(
    @CurrentUser('id') userId: string,
    @Param('partnerId') partnerId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.messagesService.getChatHistory(
      userId,
      partnerId,
      pagination.page,
      pagination.limit,
    );
  }
}
