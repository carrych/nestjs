import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { ShippingService } from '../shipping.service';
import { Shipping } from '../entities/shipping.entity';
import { Order } from '../../orders/entities/order.entity';
import { ShippingStatus } from '../enums/shipping-status.enum';
import { RabbitmqService } from '../../rabbitmq/rabbitmq.service';
import { INVOICE_SERVICE } from '../../invoices-client/invoices-client.module';

const mockShippingRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
};

const mockOrderRepo = {
  findOne: jest.fn(),
};

const mockRabbitmqService = {
  publishStatusChange: jest.fn(),
};

const mockInvoiceClient = {
  send: jest.fn(),
};

function makeShipping(overrides: Partial<Shipping> = {}): Shipping {
  return {
    id: 1,
    orderId: 10,
    userId: 5,
    trackingNumber: null,
    declaredValue: '100',
    shippingCost: null,
    weight: null,
    seatsCount: 1,
    description: null,
    status: ShippingStatus.PENDING,
    createdAt: new Date(),
    receivedAt: null,
    order: {} as Order,
    ...overrides,
  } as Shipping;
}

describe('ShippingService', () => {
  let service: ShippingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingService,
        { provide: getRepositoryToken(Shipping), useValue: mockShippingRepo },
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: RabbitmqService, useValue: mockRabbitmqService },
        { provide: INVOICE_SERVICE, useValue: mockInvoiceClient },
      ],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create()', () => {
    it('throws NotFoundException when order does not exist', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({
          orderId: 99,
          userId: 1,
          declaredValue: 100,
          status: ShippingStatus.PENDING,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('saves shipping and fires invoice creation', async () => {
      const order = { id: 10, items: [{ productId: 1, amount: 2, price: '150', discount: '10' }] };
      mockOrderRepo.findOne.mockResolvedValue(order);
      const shipping = makeShipping();
      mockShippingRepo.create.mockReturnValue(shipping);
      mockShippingRepo.save.mockResolvedValue(shipping);
      mockInvoiceClient.send.mockReturnValue(of({ id: 1 }));

      const result = await service.create({
        orderId: 10,
        userId: 5,
        declaredValue: 100,
        status: ShippingStatus.PENDING,
      });

      expect(result).toEqual(shipping);
      expect(mockInvoiceClient.send).toHaveBeenCalledWith(
        { cmd: 'invoice.create' },
        expect.objectContaining({ orderId: 10, userId: 5, type: 'sales' }),
      );
    });

    it('does not throw if invoice client errors', async () => {
      const order = { id: 10, items: [] };
      mockOrderRepo.findOne.mockResolvedValue(order);
      const shipping = makeShipping();
      mockShippingRepo.create.mockReturnValue(shipping);
      mockShippingRepo.save.mockResolvedValue(shipping);
      mockInvoiceClient.send.mockReturnValue(throwError(() => new Error('RMQ down')));

      await expect(
        service.create({
          orderId: 10,
          userId: 5,
          declaredValue: 100,
          status: ShippingStatus.PENDING,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('update()', () => {
    it('throws NotFoundException when shipping does not exist', async () => {
      mockShippingRepo.findOne.mockResolvedValue(null);
      await expect(service.update(99, { status: ShippingStatus.DELIVERING })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('publishes status.changes when status changes', async () => {
      const shipping = makeShipping({ status: ShippingStatus.PENDING, orderId: 10 });
      mockShippingRepo.findOne.mockResolvedValue(shipping);
      mockShippingRepo.save.mockResolvedValue({ ...shipping, status: ShippingStatus.DELIVERING });

      await service.update(1, { status: ShippingStatus.DELIVERING });

      expect(mockRabbitmqService.publishStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'shipping', status: ShippingStatus.DELIVERING }),
      );
    });

    it('does not publish when status is unchanged', async () => {
      const shipping = makeShipping({ status: ShippingStatus.DELIVERING });
      mockShippingRepo.findOne.mockResolvedValue(shipping);
      mockShippingRepo.save.mockResolvedValue(shipping);

      await service.update(1, { status: ShippingStatus.DELIVERING });

      expect(mockRabbitmqService.publishStatusChange).not.toHaveBeenCalled();
    });

    it('does not publish when dto has no status field', async () => {
      const shipping = makeShipping();
      mockShippingRepo.findOne.mockResolvedValue(shipping);
      mockShippingRepo.save.mockResolvedValue(shipping);

      await service.update(1, { trackingNumber: 'NP-001' });

      expect(mockRabbitmqService.publishStatusChange).not.toHaveBeenCalled();
    });

    it('sets receivedAt when transitioning to received', async () => {
      const shipping = makeShipping({ status: ShippingStatus.DELIVERING, receivedAt: null });
      mockShippingRepo.findOne.mockResolvedValue(shipping);
      mockShippingRepo.save.mockImplementation(async (s: Shipping) => s);

      const result = await service.update(1, { status: ShippingStatus.RECEIVED });

      expect(result.receivedAt).toBeInstanceOf(Date);
    });
  });
});
