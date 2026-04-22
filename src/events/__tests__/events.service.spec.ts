import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

import { EventsService } from '../events.service';
import { EventsGateway } from '../events.gateway';
import { RabbitmqService } from '../../rabbitmq/rabbitmq.service';

const mockGateway = {
  emitToUser: jest.fn(),
};

const mockRabbitmq = {
  consume: jest.fn(),
};

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: EventsGateway, useValue: mockGateway },
        { provide: RabbitmqService, useValue: mockRabbitmq },
      ],
    }).compile();

    service = module.get(EventsService);
  });

  describe('toWsEventName()', () => {
    it('maps order → order.created', () => {
      expect(service.toWsEventName('order')).toBe('order.created');
    });

    it('maps invoice → invoice.ready', () => {
      expect(service.toWsEventName('invoice')).toBe('invoice.ready');
    });

    it('maps payment → payment.updated', () => {
      expect(service.toWsEventName('payment')).toBe('payment.updated');
    });

    it('maps shipping → shipping.updated', () => {
      expect(service.toWsEventName('shipping')).toBe('shipping.updated');
    });
  });

  describe('onApplicationBootstrap()', () => {
    it('subscribes to ws.notifications when WORKERS_ENABLED is not false', async () => {
      delete process.env.WORKERS_ENABLED;
      await service.onApplicationBootstrap();
      expect(mockRabbitmq.consume).toHaveBeenCalledWith(
        'ws.notifications',
        expect.any(Function),
      );
    });

    it('skips consumer when WORKERS_ENABLED=false', async () => {
      process.env.WORKERS_ENABLED = 'false';
      await service.onApplicationBootstrap();
      expect(mockRabbitmq.consume).not.toHaveBeenCalled();
      delete process.env.WORKERS_ENABLED;
    });
  });

  describe('handleEvent() — via consume handler', () => {
    function makeMsg(event: object) {
      return {
        content: Buffer.from(JSON.stringify(event)),
      };
    }

    const mockChannel = { ack: jest.fn() };

    beforeEach(() => {
      mockRabbitmq.consume.mockImplementation(
        async (_queue: string, handler: (msg: unknown, ch: unknown) => Promise<void>) => {
          (service as unknown as { handler: typeof handler }).handler = handler;
        },
      );
    });

    async function triggerMessage(event: object) {
      await service.onApplicationBootstrap();
      const handler = (service as unknown as { handler: (m: unknown, c: unknown) => Promise<void> }).handler;
      await handler(makeMsg(event), mockChannel);
    }

    it('emits order.created to correct user with payload', async () => {
      await triggerMessage({
        entity: 'order',
        entityId: 5,
        orderId: 5,
        userId: 42,
        status: 'pending',
        updatedAt: '2024-01-01T00:00:00Z',
        correlationId: 'corr-123',
      });

      expect(mockGateway.emitToUser).toHaveBeenCalledWith(
        42,
        'order.created',
        expect.objectContaining({
          correlationId: 'corr-123',
          orderId: 5,
          data: expect.objectContaining({ status: 'pending' }),
        }),
      );
      expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('emits payment.updated for payment entity', async () => {
      await triggerMessage({
        entity: 'payment',
        entityId: 10,
        orderId: 5,
        userId: 42,
        status: 'completed',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      expect(mockGateway.emitToUser).toHaveBeenCalledWith(
        42,
        'payment.updated',
        expect.any(Object),
      );
    });

    it('emits invoice.ready with documentUrl and qrCodeDataUrl', async () => {
      await triggerMessage({
        entity: 'invoice',
        entityId: 5,
        orderId: 5,
        userId: 42,
        status: 'ready',
        updatedAt: '2024-01-01T00:00:00Z',
        documentUrl: 'https://cdn.example.com/invoice.pdf',
        qrCodeDataUrl: 'data:image/png;base64,abc',
      });

      expect(mockGateway.emitToUser).toHaveBeenCalledWith(
        42,
        'invoice.ready',
        expect.objectContaining({
          data: expect.objectContaining({
            documentUrl: 'https://cdn.example.com/invoice.pdf',
            qrCodeDataUrl: 'data:image/png;base64,abc',
          }),
        }),
      );
    });
  });
});
