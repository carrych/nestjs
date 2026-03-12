import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  DataSource,
  LessThanOrEqual,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { randomUUID } from 'crypto';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Stock } from '../stocks/entities/stock.entity';
import { OrderStatus } from './enums/order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { OutboxService } from '../outbox/outbox.service';
import { ProcessedMessage } from '../idempotency/processed-message.entity';
import { OrdersProcessMessage } from './orders-queue.types';
import { PAYMENTS_GRPC_CLIENT } from './orders.module';
import type {
  AuthorizeResponse,
  PaymentsGrpcClient,
} from './payments-grpc-client.interfaces';

// Valid status transitions: from → [allowed targets]
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PROCESSING, OrderStatus.CANCELED],
  [OrderStatus.PROCESSING]: [OrderStatus.COMPLETE, OrderStatus.CANCELED],
  [OrderStatus.COMPLETE]: [],
  [OrderStatus.CANCELED]: [],
  [OrderStatus.PROCESSED]: [],
};

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);
  private paymentsGrpc: PaymentsGrpcClient;
  // Typed as interface separately to avoid isolatedModules + emitDecoratorMetadata conflict
  private readonly grpcClient: ClientGrpc;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    private readonly dataSource: DataSource,
    private readonly rabbitmqService: RabbitmqService,
    private readonly outboxService: OutboxService,
    @Inject(PAYMENTS_GRPC_CLIENT) grpcClient: any,
  ) {
    this.grpcClient = grpcClient;
  }

  onModuleInit() {
    this.paymentsGrpc = this.grpcClient.getService<PaymentsGrpcClient>('Payments');
  }

  /**
   * Transactional order creation with:
   * - Idempotency via idempotencyKey (duplicate POST returns existing order)
   * - Pessimistic locking on stocks (FOR NO KEY UPDATE) to prevent oversell
   * - Atomic: order + items + stock reservation in single transaction
   */
  async create(
    dto: CreateOrderDto,
  ): Promise<{ order: Order; created: boolean; payment: AuthorizeResponse | null }> {
    // 1. Idempotency check: return existing order if key already used
    if (dto.idempotencyKey) {
      const existing = await this.orderRepository.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
        relations: { items: true },
      });
      if (existing) {
        return { order: existing, created: false, payment: null };
      }
    }

    // 2. Start transaction via QueryRunner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const productIds = dto.items.map((item) => item.productId);

      // 3. Pessimistic lock on stock rows — prevents concurrent stock modification
      //    FOR NO KEY UPDATE: locks the row but doesn't block FK lookups
      const lockedStocks = await queryRunner.manager
        .getRepository(Stock)
        .createQueryBuilder('stock')
        .where('stock.product_id IN (:...productIds)', { productIds })
        .setLock('pessimistic_write')
        .getMany();

      const stockByProductId = new Map(
        lockedStocks.map((s) => [Number(s.productId), s]),
      );

      // 4. Validate stock availability: (stock - reserved) >= requested amount
      for (const item of dto.items) {
        const stock = stockByProductId.get(item.productId);
        if (!stock) {
          throw new ConflictException(
            `No stock record for product #${item.productId}`,
          );
        }

        const available = stock.stock - stock.reserved;
        if (available < item.amount) {
          throw new ConflictException(
            `Insufficient stock for product #${item.productId}: available=${available}, requested=${item.amount}`,
          );
        }
      }

      // 5. Create order
      const order = queryRunner.manager.getRepository(Order).create({
        userId: dto.userId,
        addressId: dto.addressId ?? null,
        idempotencyKey: dto.idempotencyKey ?? null,
        status: OrderStatus.PENDING,
      });
      const savedOrder = await queryRunner.manager.getRepository(Order).save(order);

      // 6. Create order items
      const orderItems = dto.items.map((item) =>
        queryRunner.manager.getRepository(OrderItem).create({
          orderId: savedOrder.id,
          productId: item.productId,
          amount: item.amount,
          price: String(item.price),
          discount: String(item.discount ?? 0),
        }),
      );
      savedOrder.items = await queryRunner.manager
        .getRepository(OrderItem)
        .save(orderItems);

      // 7. Update stock: reserved += item.amount
      for (const item of dto.items) {
        const stock = stockByProductId.get(item.productId)!;
        stock.reserved += item.amount;
        await queryRunner.manager.getRepository(Stock).save(stock);
      }

      // 8. Commit
      await queryRunner.commitTransaction();
      this.logger.log(`Order #${savedOrder.id} created (key: ${dto.idempotencyKey})`);

      // 9. Publish to queue (fire-and-forget — does not block the API response)
      const message: OrdersProcessMessage = {
        messageId: randomUUID(),
        orderId: savedOrder.id,
        attempt: 1,
      };
      this.rabbitmqService.publishToQueue('orders.process', message, {
        messageId: message.messageId,
      });

      // 10. Authorize payment via gRPC (after commit to avoid holding DB transaction)
      const totalAmount = dto.items
        .reduce((sum, item) => sum + Number(item.price) * item.amount, 0)
        .toFixed(2);
      const payment = await this.authorizePayment(
        savedOrder.id,
        totalAmount,
        dto.idempotencyKey,
      );

      return { order: savedOrder, created: true, payment };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      // Handle race condition: another request inserted the same idempotencyKey
      if (
        error instanceof QueryFailedError &&
        (error as any).code === '23505' &&
        dto.idempotencyKey
      ) {
        const existing = await this.orderRepository.findOne({
          where: { idempotencyKey: dto.idempotencyKey },
          relations: { items: true },
        });
        if (existing) {
          return { order: existing, created: false, payment: null };
        }
      }

      // Rethrow any HTTP exception (business errors + gRPC-mapped errors like 503/504)
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Order creation failed: ${error}`);
      throw new InternalServerErrorException('Order creation failed');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Calls Payments.Authorize via gRPC with a configurable deadline.
   * Maps gRPC status codes → HTTP exceptions so callers get clean errors.
   */
  private async authorizePayment(
    orderId: number,
    amount: string,
    idempotencyKey?: string | null,
  ): Promise<AuthorizeResponse | null> {
    const timeoutMs = Number(process.env.PAYMENTS_GRPC_TIMEOUT_MS ?? 5000);
    const deadline = new Date(Date.now() + timeoutMs);

    try {
      const response = await firstValueFrom(
        this.paymentsGrpc.authorize(
          { orderId, amount, currency: 'UAH', idempotencyKey: idempotencyKey ?? undefined },
          new Metadata(),
          { deadline },
        ),
      );
      this.logger.log(
        `Payment authorized (orderId=${orderId}, paymentId=${response.paymentId}, status=${response.status})`,
      );
      return response;
    } catch (err: any) {
      const code = err?.code;
      this.logger.error(`Payments.Authorize failed (orderId=${orderId}): ${err?.message}`);

      if (code === GrpcStatus.DEADLINE_EXCEEDED) {
        throw new GatewayTimeoutException('Payment service timed out');
      }
      if (code === GrpcStatus.UNAVAILABLE) {
        throw new ServiceUnavailableException('Payment service unavailable');
      }
      throw new InternalServerErrorException('Payment authorization failed');
    }
  }

  async processFromQueue(message: OrdersProcessMessage): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      try {
        await manager.getRepository(ProcessedMessage).insert({
          scope: 'orders.process',
          messageId: message.messageId,
          idempotencyKey: null,
        });
      } catch (err: any) {
        if (String(err?.code) === '23505') {
          return; // Already processed — idempotent skip
        }
        throw err;
      }

      if (message.simulate === 'alwaysFail') {
        throw new Error('Simulated processing error');
      }

      const orderRepository = manager.getRepository(Order);
      const order = await orderRepository.findOne({ where: { id: message.orderId } });
      if (!order) {
        throw new NotFoundException(`Order #${message.orderId} not found`);
      }

      order.status = OrderStatus.PROCESSED;
      order.processedAt = new Date();
      await orderRepository.save(order);

      await this.outboxService.add('ORDER_PROCESSED', { orderId: order.id }, manager);
    });
  }

  async findAll(query: QueryOrderDto): Promise<Order[]> {
    const where = this.buildWhere(query);
    const { limit = 10, offset = 0 } = query;

    return this.orderRepository.find({
      where,
      relations: { items: true },
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findAllWithCount(query: QueryOrderDto): Promise<[Order[], number]> {
    const where = this.buildWhere(query);
    const { limit = 10, offset = 0 } = query;

    return this.orderRepository.findAndCount({
      where,
      relations: { items: true },
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  private buildWhere(query: QueryOrderDto): Record<string, unknown> {
    const { status, userId, dateFrom, dateTo } = query;
    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (dateFrom) where.createdAt = MoreThanOrEqual(new Date(dateFrom));
    if (dateTo) where.createdAt = LessThanOrEqual(new Date(dateTo));

    return where;
  }

  async findOne(id: number): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: { items: true, payments: true, shipments: true },
    });
    if (!order) {
      throw new NotFoundException(`Order #${id} not found`);
    }
    return order;
  }

  async updateStatus(id: number, dto: UpdateOrderStatusDto): Promise<Order> {
    const order = await this.findOne(id);
    const allowed = STATUS_TRANSITIONS[order.status];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from '${order.status}' to '${dto.status}'`,
      );
    }

    order.status = dto.status;
    return this.orderRepository.save(order);
  }

  async remove(id: number): Promise<void> {
    const order = await this.findOne(id);
    await this.orderRepository.remove(order);
  }
}
