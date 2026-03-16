import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxMessage } from './outbox-message.entity';
import { OutboxService } from './outbox.service';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxMessage])],
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService],
})
export class OutboxModule {}
