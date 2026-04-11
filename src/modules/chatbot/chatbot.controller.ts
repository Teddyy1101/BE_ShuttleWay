import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatbotService } from './chatbot.service';
import { ChatbotAskDto } from './dto/chatbot-ask.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../../generated/prisma/client';

@ApiTags('Chatbot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('ask')
  @Roles(Role.PARENT, Role.STUDENT)
  @ApiOperation({ summary: 'Gửi câu hỏi tới Chatbot AI tư vấn (PARENT, STUDENT)' })
  ask(@CurrentUser() currentUser: any, @Body() dto: ChatbotAskDto) {
    return this.chatbotService.ask(currentUser, dto);
  }
}
