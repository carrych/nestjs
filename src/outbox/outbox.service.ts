import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OutboxMessage, OutboxStatus } from './outbox-message.entity';

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxMessage)
    private readonly outboxRepository: Repository<OutboxMessage>,
  ) {}

  async add(
    type: string,
    payload: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<OutboxMessage> {
    const repo = manager ? manager.getRepository(OutboxMessage) : this.outboxRepository;
    const message = repo.create({
      type,
      payload,
      status: OutboxStatus.PENDING,
      attempts: 0,
      nextAttemptAt: new Date(),
    });
    return repo.save(message);
  }
}
