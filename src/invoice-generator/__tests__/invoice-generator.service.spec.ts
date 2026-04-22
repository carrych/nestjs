import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

import { InvoiceGeneratorService } from '../invoice-generator.service';
import { RabbitmqService } from '../../rabbitmq/rabbitmq.service';
import { StorageService } from '../../files/services/storage.service';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { InvoiceQrService } from '../services/invoice-qr.service';

const mockRabbitmq = {
  consume: jest.fn(),
  publishStatusChange: jest.fn(),
};

const mockStorage = {
  putObject: jest.fn(),
  getViewUrl: jest.fn().mockReturnValue('https://cdn.example.com/invoices/1/doc.pdf'),
};

const mockPdf = {
  generate: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
};

const mockQr = {
  generateDataUrl: jest.fn().mockResolvedValue('data:image/png;base64,abc123'),
};

function makeMsg(payload: object) {
  return { content: Buffer.from(JSON.stringify(payload)) };
}

const mockChannel = { ack: jest.fn(), nack: jest.fn() };

describe('InvoiceGeneratorService', () => {
  let service: InvoiceGeneratorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceGeneratorService,
        { provide: RabbitmqService, useValue: mockRabbitmq },
        { provide: StorageService, useValue: mockStorage },
        { provide: InvoicePdfService, useValue: mockPdf },
        { provide: InvoiceQrService, useValue: mockQr },
      ],
    }).compile();

    service = module.get(InvoiceGeneratorService);
  });

  describe('onApplicationBootstrap()', () => {
    it('subscribes to invoices_queue when WORKERS_ENABLED is not false', async () => {
      delete process.env.WORKERS_ENABLED;
      await service.onApplicationBootstrap();
      expect(mockRabbitmq.consume).toHaveBeenCalledWith('invoices_queue', expect.any(Function));
    });

    it('skips consumer when WORKERS_ENABLED=false', async () => {
      process.env.WORKERS_ENABLED = 'false';
      await service.onApplicationBootstrap();
      expect(mockRabbitmq.consume).not.toHaveBeenCalled();
      delete process.env.WORKERS_ENABLED;
    });
  });

  describe('handleMessage() — via consume handler', () => {
    beforeEach(() => {
      mockRabbitmq.consume.mockImplementation(
        async (_q: string, handler: (m: unknown, c: unknown) => Promise<void>) => {
          (service as unknown as { _handler: typeof handler })._handler = handler;
        },
      );
    });

    async function trigger(payload: object) {
      await service.onApplicationBootstrap();
      const h = (service as unknown as { _handler: (m: unknown, c: unknown) => Promise<void> })
        ._handler;
      await h(makeMsg(payload), mockChannel);
    }

    it('generates PDF, uploads to S3, emits invoice.ready, and ACKs', async () => {
      await trigger({
        orderId: 7,
        userId: 3,
        type: 'sales',
        correlationId: 'corr-abc',
        items: [{ productId: 1, quantity: 1, price: 100, discount: 0 }],
      });

      expect(mockPdf.generate).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 7, userId: 3 }),
      );
      expect(mockStorage.putObject).toHaveBeenCalledWith(
        expect.stringMatching(/^invoices\/7\/.+\.pdf$/),
        expect.any(Buffer),
        'application/pdf',
      );
      expect(mockQr.generateDataUrl).toHaveBeenCalledWith(
        'https://cdn.example.com/invoices/1/doc.pdf',
      );
      expect(mockRabbitmq.publishStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'invoice',
          orderId: 7,
          userId: 3,
          status: 'ready',
          correlationId: 'corr-abc',
          documentUrl: 'https://cdn.example.com/invoices/1/doc.pdf',
          qrCodeDataUrl: 'data:image/png;base64,abc123',
        }),
      );
      expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('ACKs and discards message with invalid JSON (no error thrown)', async () => {
      await service.onApplicationBootstrap();
      const h = (service as unknown as { _handler: (m: unknown, c: unknown) => Promise<void> })
        ._handler;

      const badMsg = { content: Buffer.from('not-json{{{') };
      await h(badMsg, mockChannel);

      expect(mockChannel.ack).toHaveBeenCalled();
      expect(mockPdf.generate).not.toHaveBeenCalled();
      expect(mockRabbitmq.publishStatusChange).not.toHaveBeenCalled();
    });
  });
});
