import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { of, throwError } from 'rxjs';
import { status as GrpcStatus } from '@grpc/grpc-js';

import { OrdersService } from '../orders.service';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Stock } from '../../stocks/entities/stock.entity';
import { ProcessedMessage } from '../../idempotency/processed-message.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { RabbitmqService } from '../../rabbitmq/rabbitmq.service';
import { OutboxService } from '../../outbox/outbox.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { PAYMENTS_GRPC_CLIENT } from '../orders.constants';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    userId: 10,
    addressId: null,
    idempotencyKey: null,
    status: OrderStatus.PENDING,
    processedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    payments: [],
    shipments: [],
    ...overrides,
  } as unknown as Order;
}

function makeStock(productId: number, stock = 100, reserved = 0) {
  return { id: productId, productId, stock, reserved } as unknown as Stock;
}

// ─── QueryRunner mock factory ─────────────────────────────────────────────────

function makeQueryRunner(stockRows: Stock[], savedOrder: Order, savedItems: OrderItem[] = []) {
  const processedRepo = { insert: jest.fn().mockResolvedValue(undefined) };
  const orderRepo = {
    create: jest.fn().mockReturnValue(savedOrder),
    save: jest.fn().mockResolvedValue(savedOrder),
    findOne: jest.fn().mockResolvedValue(savedOrder),
  };
  const orderItemRepo = {
    create: jest.fn().mockReturnValue({}),
    save: jest.fn().mockResolvedValue(savedItems),
  };
  const stockRepo = { createQueryBuilder: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };

  const qb = {
    where: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(stockRows),
  };
  stockRepo.createQueryBuilder.mockReturnValue(qb);

  const manager = {
    getRepository: jest.fn().mockImplementation((entity: unknown) => {
      if (entity === Stock) return stockRepo;
      if (entity === Order) return orderRepo;
      if (entity === OrderItem) return orderItemRepo;
      if (entity === ProcessedMessage) return processedRepo;
      return {};
    }),
  };

  const qr = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager,
  };

  return { qr, manager, orderRepo, orderItemRepo, stockRepo, processedRepo };
}

// ─── gRPC mock ────────────────────────────────────────────────────────────────

const mockPaymentResponse = { paymentId: 'pay-uuid-1', status: 'AUTHORIZED' };

function makeMockPaymentsGrpc(authorizeImpl?: () => unknown) {
  const authorize = jest.fn().mockImplementation(authorizeImpl ?? (() => of(mockPaymentResponse)));
  const grpcService = { authorize };
  const grpcClient = { getService: jest.fn().mockReturnValue(grpcService) };
  return { grpcClient, grpcService };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    findAndCount: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let rabbitmqService: { publishToQueue: jest.Mock };
  let outboxService: { add: jest.Mock };
  let dataSource: { createQueryRunner: jest.Mock; transaction: jest.Mock };
  let grpcService: { authorize: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    orderRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    rabbitmqService = { publishToQueue: jest.fn().mockReturnValue(true) };
    outboxService = { add: jest.fn().mockResolvedValue(undefined) };

    dataSource = {
      createQueryRunner: jest.fn(),
      transaction: jest.fn(),
    };

    const { grpcClient, grpcService: gs } = makeMockPaymentsGrpc();
    grpcService = gs;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepository },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: RabbitmqService, useValue: rabbitmqService },
        { provide: OutboxService, useValue: outboxService },
        { provide: PAYMENTS_GRPC_CLIENT, useValue: grpcClient },
      ],
    }).compile();

    service = module.get(OrdersService);
    service.onModuleInit();
  });

  // ── create() ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    const dto: CreateOrderDto = {
      userId: 10,
      addressId: null,
      idempotencyKey: 'key-1',
      items: [{ productId: 1, amount: 2, price: 50, discount: 0 }],
    } as unknown as CreateOrderDto;

    it('publishes to orders.process queue and calls Payments.Authorize', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      const savedOrder = makeOrder({ id: 7 });
      const { qr } = makeQueryRunner([makeStock(1)], savedOrder, []);
      dataSource.createQueryRunner.mockReturnValue(qr);

      const result = await service.create(dto);

      expect(result.created).toBe(true);
      expect(result.order.id).toBe(7);
      expect(rabbitmqService.publishToQueue).toHaveBeenCalledWith(
        'orders.process',
        expect.objectContaining({ orderId: 7, attempt: 1, messageId: expect.any(String) }),
        expect.objectContaining({ messageId: expect.any(String) }),
      );
      expect(grpcService.authorize).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 7,
          amount: '100.00',
          currency: 'UAH',
          idempotencyKey: 'key-1',
        }),
        expect.anything(), // Metadata
        expect.objectContaining({ deadline: expect.any(Date) }),
      );
    });

    it('returns payment info in result after successful Authorize', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      const savedOrder = makeOrder({ id: 7 });
      const { qr } = makeQueryRunner([makeStock(1)], savedOrder, []);
      dataSource.createQueryRunner.mockReturnValue(qr);

      const result = await service.create(dto);

      expect(result.payment).toEqual({ paymentId: 'pay-uuid-1', status: 'AUTHORIZED' });
    });

    it('passes idempotencyKey to Authorize call', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      const savedOrder = makeOrder({ id: 8 });
      const { qr } = makeQueryRunner([makeStock(1)], savedOrder, []);
      dataSource.createQueryRunner.mockReturnValue(qr);

      await service.create({ ...dto, idempotencyKey: 'my-key' } as unknown as CreateOrderDto);

      expect(grpcService.authorize).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'my-key' }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('applies a Date deadline to the gRPC call', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      const savedOrder = makeOrder({ id: 9 });
      const { qr } = makeQueryRunner([makeStock(1)], savedOrder, []);
      dataSource.createQueryRunner.mockReturnValue(qr);

      const before = Date.now();
      await service.create(dto);
      const after = Date.now();

      const callOptions = grpcService.authorize.mock.calls[0][2] as { deadline: Date };
      expect(callOptions.deadline).toBeInstanceOf(Date);
      expect(callOptions.deadline.getTime()).toBeGreaterThan(before);
      expect(callOptions.deadline.getTime()).toBeLessThanOrEqual(after + 10_000);
    });

    it('throws GatewayTimeoutException when Authorize returns DEADLINE_EXCEEDED', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      grpcService.authorize.mockReturnValueOnce(
        throwError(() =>
          Object.assign(new Error('deadline'), { code: GrpcStatus.DEADLINE_EXCEEDED }),
        ),
      );

      const savedOrder = makeOrder({ id: 10 });
      const { qr } = makeQueryRunner([makeStock(1)], savedOrder, []);
      dataSource.createQueryRunner.mockReturnValue(qr);

      await expect(service.create(dto)).rejects.toThrow(GatewayTimeoutException);
    });

    it('throws ServiceUnavailableException when Authorize returns UNAVAILABLE', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      grpcService.authorize.mockReturnValueOnce(
        throwError(() => Object.assign(new Error('unavailable'), { code: GrpcStatus.UNAVAILABLE })),
      );

      const savedOrder = makeOrder({ id: 11 });
      const { qr } = makeQueryRunner([makeStock(1)], savedOrder, []);
      dataSource.createQueryRunner.mockReturnValue(qr);

      await expect(service.create(dto)).rejects.toThrow(ServiceUnavailableException);
    });

    it('throws InternalServerErrorException when Authorize fails with unknown gRPC error', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      grpcService.authorize.mockReturnValueOnce(
        throwError(() => Object.assign(new Error('internal'), { code: GrpcStatus.INTERNAL })),
      );

      const savedOrder = makeOrder({ id: 12 });
      const { qr } = makeQueryRunner([makeStock(1)], savedOrder, []);
      dataSource.createQueryRunner.mockReturnValue(qr);

      await expect(service.create(dto)).rejects.toThrow(InternalServerErrorException);
    });

    it('returns existing order (created=false) when idempotency key matches', async () => {
      const existing = makeOrder({ id: 3 });
      orderRepository.findOne.mockResolvedValueOnce(existing);

      const result = await service.create(dto);

      expect(result.created).toBe(false);
      expect(result.order).toBe(existing);
      expect(result.payment).toBeNull();
      expect(rabbitmqService.publishToQueue).not.toHaveBeenCalled();
      expect(grpcService.authorize).not.toHaveBeenCalled();
    });

    it('throws ConflictException on insufficient stock', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      const { qr, orderRepo } = makeQueryRunner([makeStock(1, 10, 10)], makeOrder());
      orderRepo.save.mockResolvedValue(makeOrder());
      dataSource.createQueryRunner.mockReturnValue(qr);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(rabbitmqService.publishToQueue).not.toHaveBeenCalled();
      expect(grpcService.authorize).not.toHaveBeenCalled();
    });

    it('throws ConflictException when no stock record exists for product', async () => {
      orderRepository.findOne.mockResolvedValueOnce(null);

      const { qr } = makeQueryRunner([], makeOrder());
      dataSource.createQueryRunner.mockReturnValue(qr);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(grpcService.authorize).not.toHaveBeenCalled();
    });

    it('handles race condition 23505 and returns existing order', async () => {
      orderRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeOrder({ id: 5 }));

      const { qr } = makeQueryRunner([makeStock(1)], makeOrder());
      const err = Object.assign(new QueryFailedError('', [], new Error()), { code: '23505' });
      qr.commitTransaction.mockRejectedValueOnce(err);

      dataSource.createQueryRunner.mockReturnValue(qr);

      const result = await service.create(dto);

      expect(result.created).toBe(false);
      expect(result.order.id).toBe(5);
      expect(grpcService.authorize).not.toHaveBeenCalled();
    });
  });

  // ── processFromQueue() ────────────────────────────────────────────────────────

  describe('processFromQueue()', () => {
    const baseMessage = { messageId: 'msg-abc', orderId: 1, attempt: 1 };

    it('marks order PROCESSED and adds outbox event', async () => {
      const order = makeOrder({ id: 1, status: OrderStatus.PENDING });
      const processedRepo = { insert: jest.fn().mockResolvedValue(undefined) };
      const orderRepo = {
        findOne: jest.fn().mockResolvedValue(order),
        save: jest.fn().mockResolvedValue(order),
      };

      const manager = {
        getRepository: jest.fn().mockImplementation((entity: unknown) => {
          if (entity === ProcessedMessage) return processedRepo;
          if (entity === Order) return orderRepo;
          return {};
        }),
      };

      dataSource.transaction.mockImplementation((cb: (m: typeof manager) => Promise<void>) =>
        cb(manager),
      );

      await service.processFromQueue(baseMessage);

      expect(processedRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'orders.process', messageId: 'msg-abc' }),
      );
      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PROCESSED }),
      );
      expect(outboxService.add).toHaveBeenCalledWith('ORDER_PROCESSED', { orderId: 1 }, manager);
    });

    it('silently returns (idempotent skip) when message already processed (23505)', async () => {
      const processedRepo = {
        insert: jest.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' })),
      };
      const manager = {
        getRepository: jest.fn().mockReturnValue(processedRepo),
      };
      dataSource.transaction.mockImplementation((cb: (m: typeof manager) => Promise<void>) =>
        cb(manager),
      );

      await expect(service.processFromQueue(baseMessage)).resolves.toBeUndefined();
      expect(outboxService.add).not.toHaveBeenCalled();
    });

    it('throws when insert into processed_messages fails with non-23505 error', async () => {
      const processedRepo = {
        insert: jest
          .fn()
          .mockRejectedValue(Object.assign(new Error('db error'), { code: '42P01' })),
      };
      const manager = { getRepository: jest.fn().mockReturnValue(processedRepo) };
      dataSource.transaction.mockImplementation((cb: (m: typeof manager) => Promise<void>) =>
        cb(manager),
      );

      await expect(service.processFromQueue(baseMessage)).rejects.toThrow('db error');
    });

    it('throws NotFoundException when order does not exist', async () => {
      const processedRepo = { insert: jest.fn().mockResolvedValue(undefined) };
      const orderRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const manager = {
        getRepository: jest.fn().mockImplementation((entity: unknown) => {
          if (entity === ProcessedMessage) return processedRepo;
          if (entity === Order) return orderRepo;
          return {};
        }),
      };
      dataSource.transaction.mockImplementation((cb: (m: typeof manager) => Promise<void>) =>
        cb(manager),
      );

      await expect(service.processFromQueue(baseMessage)).rejects.toThrow(NotFoundException);
    });

    it('throws Error when simulate=alwaysFail', async () => {
      const processedRepo = { insert: jest.fn().mockResolvedValue(undefined) };
      const manager = { getRepository: jest.fn().mockReturnValue(processedRepo) };
      dataSource.transaction.mockImplementation((cb: (m: typeof manager) => Promise<void>) =>
        cb(manager),
      );

      await expect(
        service.processFromQueue({ ...baseMessage, simulate: 'alwaysFail' }),
      ).rejects.toThrow('Simulated processing error');
    });
  });

  // ── updateStatus() ────────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('throws BadRequestException on invalid transition (COMPLETE → PENDING)', async () => {
      const order = makeOrder({ status: OrderStatus.COMPLETE });
      orderRepository.findOne.mockResolvedValue(order);

      await expect(service.updateStatus(1, { status: OrderStatus.PENDING })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('transitions PENDING → PROCESSING successfully', async () => {
      const order = makeOrder({ status: OrderStatus.PENDING });
      orderRepository.findOne.mockResolvedValue(order);
      orderRepository.save.mockResolvedValue({ ...order, status: OrderStatus.PROCESSING });

      const result = await service.updateStatus(1, { status: OrderStatus.PROCESSING });
      expect(result.status).toBe(OrderStatus.PROCESSING);
    });
  });

  // ── findOne() ─────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns order when found', async () => {
      const order = makeOrder({ id: 1 });
      orderRepository.findOne.mockResolvedValue(order);

      const result = await service.findOne(1);
      expect(result).toBe(order);
    });

    it('throws NotFoundException when not found', async () => {
      orderRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });
});
