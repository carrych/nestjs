import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Shipping } from './entities/shipping.entity';
import { Order } from '../orders/entities/order.entity';
import { CreateShippingDto } from './dto/create-shipping.dto';
import { UpdateShippingDto } from './dto/update-shipping.dto';
import { ShippingStatus } from './enums/shipping-status.enum';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    @InjectRepository(Shipping)
    private readonly shippingRepository: Repository<Shipping>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  async create(dto: CreateShippingDto, correlationId?: string): Promise<Shipping> {
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException(`Order #${dto.orderId} not found`);
    }

    const shipping = this.shippingRepository.create({
      orderId: dto.orderId,
      userId: dto.userId,
      trackingNumber: dto.trackingNumber ?? null,
      declaredValue: String(dto.declaredValue),
      shippingCost: dto.shippingCost != null ? String(dto.shippingCost) : null,
      weight: dto.weight != null ? String(dto.weight) : null,
      seatsCount: dto.seatsCount ?? 1,
      description: dto.description ?? null,
      status: dto.status,
    });

    const saved = await this.shippingRepository.save(shipping);

    try {
      this.rabbitmqService.publishToQueue('invoices_queue', {
        orderId: order.id,
        userId: dto.userId,
        type: 'sales',
        correlationId,
        items: order.items.map((item) => ({
          productId: Number(item.productId),
          quantity: item.amount,
          price: Number(item.price),
          discount: Number(item.discount),
        })),
      });
    } catch (err) {
      this.logger.error('Failed to enqueue invoice creation', (err as Error)?.stack);
    }

    return saved;
  }

  async findAll(orderId?: number): Promise<Shipping[]> {
    const where: Record<string, unknown> = {};
    if (orderId) where.orderId = orderId;

    return this.shippingRepository.find({
      where,
      relations: { order: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllWithCount(orderId?: number, limit = 10, offset = 0): Promise<[Shipping[], number]> {
    const where: Record<string, unknown> = {};
    if (orderId) where.orderId = orderId;

    return this.shippingRepository.findAndCount({
      where,
      relations: { order: true },
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Shipping> {
    const shipping = await this.shippingRepository.findOne({
      where: { id },
      relations: { order: true },
    });
    if (!shipping) {
      throw new NotFoundException(`Shipping #${id} not found`);
    }
    return shipping;
  }

  async update(id: number, dto: UpdateShippingDto, correlationId?: string): Promise<Shipping> {
    const shipping = await this.findOne(id);
    const prevStatus = shipping.status;

    if (dto.trackingNumber !== undefined) shipping.trackingNumber = dto.trackingNumber;
    if (dto.declaredValue !== undefined) shipping.declaredValue = String(dto.declaredValue);
    if (dto.shippingCost !== undefined) {
      shipping.shippingCost = dto.shippingCost != null ? String(dto.shippingCost) : null;
    }
    if (dto.weight !== undefined) {
      shipping.weight = dto.weight != null ? String(dto.weight) : null;
    }
    if (dto.seatsCount !== undefined) shipping.seatsCount = dto.seatsCount;
    if (dto.description !== undefined) shipping.description = dto.description;

    // When status changes to 'received', set receivedAt
    if (dto.status !== undefined) {
      shipping.status = dto.status;
      if (dto.status === ShippingStatus.RECEIVED && !shipping.receivedAt) {
        shipping.receivedAt = new Date();
      }
    }

    const updated = await this.shippingRepository.save(shipping);

    if (dto.status !== undefined && dto.status !== prevStatus) {
      this.rabbitmqService.publishStatusChange({
        entity: 'shipping',
        entityId: updated.id,
        orderId: Number(updated.orderId),
        userId: updated.userId,
        status: updated.status,
        updatedAt: new Date().toISOString(),
        correlationId,
      });
    }

    return updated;
  }

  async remove(id: number): Promise<void> {
    const shipping = await this.findOne(id);
    await this.shippingRepository.remove(shipping);
  }
}
