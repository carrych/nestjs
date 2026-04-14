import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';

import { OrdersWorkerService } from '../orders-worker.service';
import { RabbitmqService } from '../../rabbitmq/rabbitmq.service';
import { OrdersService } from '../orders.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMsg(payload: object): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(payload)) } as ConsumeMessage;
}

function makeChannel(): jest.Mocked<Pick<Channel, 'ack' | 'nack'>> {
  return { ack: jest.fn(), nack: jest.fn() };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('OrdersWorkerService', () => {
  let service: OrdersWorkerService;
  let rabbitmqService: { consume: jest.Mock; publishToQueue: jest.Mock };
  let ordersService: { processFromQueue: jest.Mock };

  // Capture the handler registered with rabbitmqService.consume
  let registeredHandler: (msg: ConsumeMessage, ch: Channel) => Promise<void>;

  const originalEnv = process.env.WORKERS_ENABLED;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    process.env.WORKERS_ENABLED = 'true';

    rabbitmqService = {
      consume: jest.fn().mockImplementation((_queue, handler) => {
        registeredHandler = handler as typeof registeredHandler;
        return Promise.resolve();
      }),
      publishToQueue: jest.fn().mockReturnValue(true),
    };

    ordersService = {
      processFromQueue: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersWorkerService,
        { provide: RabbitmqService, useValue: rabbitmqService },
        { provide: OrdersService, useValue: ordersService },
      ],
    }).compile();

    service = module.get(OrdersWorkerService);
  });

  afterEach(() => {
    process.env.WORKERS_ENABLED = originalEnv;
  });

  // ── bootstrap ───────────────────────────────────────────────────────────────

  describe('onApplicationBootstrap()', () => {
    it('subscribes to orders.process queue when WORKERS_ENABLED=true', async () => {
      await service.onApplicationBootstrap();

      expect(rabbitmqService.consume).toHaveBeenCalledWith('orders.process', expect.any(Function));
    });

    it('skips subscribe when WORKERS_ENABLED=false', async () => {
      process.env.WORKERS_ENABLED = 'false';

      await service.onApplicationBootstrap();

      expect(rabbitmqService.consume).not.toHaveBeenCalled();
    });
  });

  // ── happy path ───────────────────────────────────────────────────────────────

  describe('handleMessage() — success path', () => {
    it('calls processFromQueue and ACKs the message', async () => {
      await service.onApplicationBootstrap();
      const ch = makeChannel();
      const msg = makeMsg({ messageId: 'msg-1', orderId: 10, attempt: 1 });

      await registeredHandler(msg, ch as unknown as Channel);

      expect(ordersService.processFromQueue).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg-1', orderId: 10, attempt: 1 }),
      );
      expect(ch.ack).toHaveBeenCalledWith(msg);
      expect(rabbitmqService.publishToQueue).not.toHaveBeenCalled();
    });
  });

  // ── retry ────────────────────────────────────────────────────────────────────
  // Fake timers are used here to skip the exponential backoff delay (1s, 2s…)
  // without waiting for real time to pass.

  describe('handleMessage() — retry', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('republishes with attempt+1 and ACKs on first failure (attempt 1)', async () => {
      ordersService.processFromQueue.mockRejectedValueOnce(new Error('transient'));

      await service.onApplicationBootstrap();
      const ch = makeChannel();
      const msg = makeMsg({ messageId: 'msg-2', orderId: 11, attempt: 1 });

      const handlePromise = registeredHandler(msg, ch as unknown as Channel);
      await jest.runAllTimersAsync();
      await handlePromise;

      expect(rabbitmqService.publishToQueue).toHaveBeenCalledWith(
        'orders.process',
        expect.objectContaining({ messageId: 'msg-2', orderId: 11, attempt: 2 }),
        expect.objectContaining({ messageId: 'msg-2' }),
      );
      expect(ch.ack).toHaveBeenCalledWith(msg);
    });

    it('republishes with attempt+1 and ACKs on second failure (attempt 2)', async () => {
      ordersService.processFromQueue.mockRejectedValueOnce(new Error('transient'));

      await service.onApplicationBootstrap();
      const ch = makeChannel();
      const msg = makeMsg({ messageId: 'msg-3', orderId: 12, attempt: 2 });

      const handlePromise = registeredHandler(msg, ch as unknown as Channel);
      await jest.runAllTimersAsync();
      await handlePromise;

      expect(rabbitmqService.publishToQueue).toHaveBeenCalledWith(
        'orders.process',
        expect.objectContaining({ attempt: 3 }),
        expect.any(Object),
      );
      expect(ch.ack).toHaveBeenCalledWith(msg);
    });

    it('uses exponential backoff: delay doubles with each attempt', async () => {
      jest.spyOn(global, 'setTimeout');
      ordersService.processFromQueue.mockRejectedValueOnce(new Error('transient'));

      await service.onApplicationBootstrap();
      const ch = makeChannel();

      // attempt 1 → delay = 1000ms
      const msg1 = makeMsg({ messageId: 'msg-exp-1', orderId: 20, attempt: 1 });
      const p1 = registeredHandler(msg1, ch as unknown as Channel);
      await jest.runAllTimersAsync();
      await p1;
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);

      ordersService.processFromQueue.mockRejectedValueOnce(new Error('transient'));
      jest.clearAllMocks();
      // re-spy after clearAllMocks
      jest.spyOn(global, 'setTimeout');

      // attempt 2 → delay = 2000ms
      const msg2 = makeMsg({ messageId: 'msg-exp-2', orderId: 21, attempt: 2 });
      const p2 = registeredHandler(msg2, ch as unknown as Channel);
      await jest.runAllTimersAsync();
      await p2;
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
    });
  });

  // ── DLQ ─────────────────────────────────────────────────────────────────────

  describe('handleMessage() — DLQ', () => {
    it('sends to DLQ and ACKs when attempt >= maxAttempts (3)', async () => {
      ordersService.processFromQueue.mockRejectedValueOnce(new Error('persistent error'));

      await service.onApplicationBootstrap();
      const ch = makeChannel();
      const msg = makeMsg({ messageId: 'msg-4', orderId: 13, attempt: 3 });

      await registeredHandler(msg, ch as unknown as Channel);

      expect(rabbitmqService.publishToQueue).toHaveBeenCalledWith(
        'orders.dlq',
        expect.objectContaining({ messageId: 'msg-4', orderId: 13, attempt: 3 }),
      );
      // Must NOT retry after DLQ
      expect(rabbitmqService.publishToQueue).not.toHaveBeenCalledWith(
        'orders.process',
        expect.anything(),
        expect.anything(),
      );
      expect(ch.ack).toHaveBeenCalledWith(msg);
    });
  });

  // ── idempotency (duplicate / already processed) ──────────────────────────────

  describe('handleMessage() — idempotency', () => {
    it('ACKs without retry when processFromQueue resolves (DB caught 23505 internally)', async () => {
      // processFromQueue handles 23505 internally and resolves (no throw)
      ordersService.processFromQueue.mockResolvedValueOnce(undefined);

      await service.onApplicationBootstrap();
      const ch = makeChannel();
      const msg = makeMsg({ messageId: 'dup-msg', orderId: 14, attempt: 1 });

      await registeredHandler(msg, ch as unknown as Channel);

      expect(ch.ack).toHaveBeenCalledWith(msg);
      expect(rabbitmqService.publishToQueue).not.toHaveBeenCalled();
    });
  });

  // ── invalid JSON ─────────────────────────────────────────────────────────────

  describe('handleMessage() — invalid JSON', () => {
    it('sends raw content to DLQ and ACKs on unparseable message', async () => {
      await service.onApplicationBootstrap();
      const ch = makeChannel();
      const badMsg = { content: Buffer.from('not-json') } as ConsumeMessage;

      await registeredHandler(badMsg, ch as unknown as Channel);

      expect(rabbitmqService.publishToQueue).toHaveBeenCalledWith(
        'orders.dlq',
        expect.objectContaining({ raw: expect.any(String) }),
      );
      expect(ch.ack).toHaveBeenCalledWith(badMsg);
      expect(ordersService.processFromQueue).not.toHaveBeenCalled();
    });
  });
});
