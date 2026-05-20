import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { SessionManager } from './session-manager';

@Module({
  providers: [ChatGateway, SessionManager],
})
export class ChatModule {}
