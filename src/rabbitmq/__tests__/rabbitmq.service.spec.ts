import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// ── amqplib mock ──────────────────────────────────────────────────────────────
const mockChannel = {
  prefetch: jest.fn().mockResolvedValue(undefined),
  assertQueue: jest.fn().mockResolvedValue(undefined),
  sendToQueue: jest.fn().mockReturnValue(true),
  consume: jest.fn().mockResolvedValue(undefined),
  nack: jest.fn(),
  ack: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue(mockConnection),
}));

import * as amqp from 'amqplib';
import { RabbitmqService } from '../rabbitmq.service';

// ─────────────────────────────────────────────────────────────────────────────

describe('RabbitmqService', () => {
  let service: RabbitmqService;
  let configService: { getOrThrow: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      getOrThrow: jest.fn().mockReturnValue('amqp://guest:guest@localhost:5672'),
      get: jest.fn().mockReturnValue('5'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitmqService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(RabbitmqService);
  });

  // ── onModuleInit ────────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('connects, creates channel, sets prefetch and asserts queues', async () => {
      await service.onModuleInit();

      expect(amqp.connect).toHaveBeenCalledWith('amqp://guest:guest@localhost:5672');
      expect(mockConnection.createChannel).toHaveBeenCalledTimes(1);
      expect(mockChannel.prefetch).toHaveBeenCalledWith(5);
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('orders.process', { durable: true });
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('orders.dlq', { durable: true });
    });

    it('uses default prefetch=10 when RABBITMQ_PREFETCH is not set', async () => {
      configService.get.mockReturnValue(undefined);

      await service.onModuleInit();

      expect(mockChannel.prefetch).toHaveBeenCalledWith(10);
    });
  });

  // ── getChannel ──────────────────────────────────────────────────────────────

  describe('getChannel()', () => {
    it('throws when channel is not initialized', () => {
      expect(() => service.getChannel()).toThrow('RabbitMQ channel is not initialized');
    });

    it('returns channel after init', async () => {
      await service.onModuleInit();
      expect(service.getChannel()).toBe(mockChannel);
    });
  });

  // ── publishToQueue ──────────────────────────────────────────────────────────

  describe('publishToQueue()', () => {
    beforeEach(() => service.onModuleInit());

    it('serializes payload and sends to queue', async () => {
      const payload = { orderId: 42, attempt: 1 };
      service.publishToQueue('orders.process', payload);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'orders.process',
        Buffer.from(JSON.stringify(payload)),
        expect.objectContaining({ contentType: 'application/json', persistent: true }),
      );
    });

    it('merges extra options', async () => {
      service.publishToQueue('orders.process', {}, { messageId: 'abc' });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'orders.process',
        expect.any(Buffer),
        expect.objectContaining({ messageId: 'abc', persistent: true }),
      );
    });

    it('returns the result from sendToQueue', async () => {
      mockChannel.sendToQueue.mockReturnValueOnce(false);
      const result = service.publishToQueue('orders.process', {});
      expect(result).toBe(false);
    });
  });

  // ── consume ─────────────────────────────────────────────────────────────────

  describe('consume()', () => {
    beforeEach(() => service.onModuleInit());

    it('registers consumer with noAck:false', async () => {
      const handler = jest.fn();
      await service.consume('orders.process', handler);

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'orders.process',
        expect.any(Function),
        expect.objectContaining({ noAck: false }),
      );
    });

    it('calls handler when message arrives', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);

      // Capture the internal wrapper passed to ch.consume
      let capturedWrapper: ((msg: unknown) => Promise<void>) | null = null;
      mockChannel.consume.mockImplementationOnce((_q, wrapper) => {
        capturedWrapper = wrapper as (msg: unknown) => Promise<void>;
        return Promise.resolve();
      });

      await service.consume('orders.process', handler);

      const fakeMsg = { content: Buffer.from('{}') };
      await capturedWrapper!(fakeMsg);

      expect(handler).toHaveBeenCalledWith(fakeMsg, mockChannel);
    });

    it('nacks message on unhandled handler error', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('boom'));

      let capturedWrapper: ((msg: unknown) => Promise<void>) | null = null;
      mockChannel.consume.mockImplementationOnce((_q, wrapper) => {
        capturedWrapper = wrapper as (msg: unknown) => Promise<void>;
        return Promise.resolve();
      });

      await service.consume('orders.process', handler);

      const fakeMsg = { content: Buffer.from('{}') };
      await capturedWrapper!(fakeMsg);

      expect(mockChannel.nack).toHaveBeenCalledWith(fakeMsg, false, true);
    });

    it('silently ignores null message (consumer cancel)', async () => {
      let capturedWrapper: ((msg: unknown) => Promise<void>) | null = null;
      mockChannel.consume.mockImplementationOnce((_q, wrapper) => {
        capturedWrapper = wrapper as (msg: unknown) => Promise<void>;
        return Promise.resolve();
      });

      const handler = jest.fn();
      await service.consume('orders.process', handler);

      await capturedWrapper!(null);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── onModuleDestroy ─────────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('closes channel then connection', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockChannel.close).toHaveBeenCalledTimes(1);
      expect(mockConnection.close).toHaveBeenCalledTimes(1);
    });

    it('still closes connection if channel.close throws', async () => {
      await service.onModuleInit();
      mockChannel.close.mockRejectedValueOnce(new Error('channel error'));

      // try/finally: connection.close() is called even when channel.close() throws
      await expect(service.onModuleDestroy()).rejects.toThrow('channel error');
      expect(mockConnection.close).toHaveBeenCalledTimes(1);
    });
  });
});
