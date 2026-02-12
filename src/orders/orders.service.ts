import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Stock } from '../stocks/entities/stock.entity';
import { OrderStatus } from './enums/order-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

// Valid status transitions: from → [allowed targets]
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PROCESSING, OrderStatus.CANCELED],
  [OrderStatus.PROCESSING]: [OrderStatus.COMPLETE, OrderStatus.CANCELED],
  [OrderStatus.COMPLETE]: [],
  [OrderStatus.CANCELED]: [],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Transactional order creation with:
   * - Idempotency via idempotencyKey (duplicate POST returns existing order)
   * - Pessimistic locking on stocks (FOR NO KEY UPDATE) to prevent oversell
   * - Atomic: order + items + stock reservation in single transaction
   */
  async create(dto: CreateOrderDto): Promise<{ order: Order; created: boolean }> {
    // 1. Idempotency check: return existing order if key already used
    if (dto.idempotencyKey) {
      const existing = await this.orderRepository.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
        relations: { items: true },
      });
      if (existing) {
        return { order: existing, created: false };
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

      return { order: savedOrder, created: true };
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
          return { order: existing, created: false };
        }
      }

      // Rethrow business errors (ConflictException, etc.)
      if (
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      this.logger.error(`Order creation failed: ${error}`);
      throw new InternalServerErrorException('Order creation failed');
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(query: QueryOrderDto): Promise<Order[]> {
    const { limit = 10, offset = 0, status, userId, dateFrom, dateTo } = query;
    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (dateFrom) where.createdAt = MoreThanOrEqual(new Date(dateFrom));
    if (dateTo) where.createdAt = LessThanOrEqual(new Date(dateTo));

    return this.orderRepository.find({
      where,
      relations: { items: true },
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
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
