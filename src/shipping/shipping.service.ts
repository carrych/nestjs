import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Shipping } from './entities/shipping.entity';
import { Order } from '../orders/entities/order.entity';
import { CreateShippingDto } from './dto/create-shipping.dto';
import { UpdateShippingDto } from './dto/update-shipping.dto';
import { ShippingStatus } from './enums/shipping-status.enum';

@Injectable()
export class ShippingService {
  constructor(
    @InjectRepository(Shipping)
    private readonly shippingRepository: Repository<Shipping>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async create(dto: CreateShippingDto): Promise<Shipping> {
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId },
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

    return this.shippingRepository.save(shipping);
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

  async findAllWithCount(
    orderId?: number,
    limit = 10,
    offset = 0,
  ): Promise<[Shipping[], number]> {
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

  async update(id: number, dto: UpdateShippingDto): Promise<Shipping> {
    const shipping = await this.findOne(id);

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

    return this.shippingRepository.save(shipping);
  }

  async remove(id: number): Promise<void> {
    const shipping = await this.findOne(id);
    await this.shippingRepository.remove(shipping);
  }
}
