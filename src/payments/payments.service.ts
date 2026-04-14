import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly rabbitmqService: RabbitmqService,
  ) {}

  async create(dto: CreatePaymentDto): Promise<Payment> {
    const order = await this.orderRepository.findOne({
      where: { id: dto.orderId },
    });
    if (!order) {
      throw new NotFoundException(`Order #${dto.orderId} not found`);
    }

    const payment = this.paymentRepository.create({
      orderId: dto.orderId,
      userId: dto.userId,
      transactionNumber: dto.transactionNumber ?? null,
      amount: String(dto.amount),
      status: dto.status,
      type: dto.type,
      method: dto.method,
    });

    return this.paymentRepository.save(payment);
  }

  async findAll(query: QueryPaymentDto): Promise<Payment[]> {
    const where = this.buildWhere(query);
    const { limit = 10, offset = 0 } = query;

    return this.paymentRepository.find({
      where,
      relations: { order: true },
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findAllWithCount(query: QueryPaymentDto): Promise<[Payment[], number]> {
    const where = this.buildWhere(query);
    const { limit = 10, offset = 0 } = query;

    return this.paymentRepository.findAndCount({
      where,
      relations: { order: true },
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }

  private buildWhere(query: QueryPaymentDto): Record<string, unknown> {
    const { orderId, status } = query;
    const where: Record<string, unknown> = {};

    if (orderId) where.orderId = orderId;
    if (status) where.status = status;

    return where;
  }

  async findOne(id: number): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: { order: true },
    });
    if (!payment) {
      throw new NotFoundException(`Payment #${id} not found`);
    }
    return payment;
  }

  async update(id: number, dto: UpdatePaymentDto): Promise<Payment> {
    const payment = await this.findOne(id);
    const prevStatus = payment.status;

    if (dto.amount !== undefined) {
      payment.amount = String(dto.amount);
    }
    if (dto.status !== undefined) payment.status = dto.status;
    if (dto.type !== undefined) payment.type = dto.type;
    if (dto.method !== undefined) payment.method = dto.method;
    if (dto.transactionNumber !== undefined) {
      payment.transactionNumber = dto.transactionNumber;
    }

    const updated = await this.paymentRepository.save(payment);

    if (dto.status !== undefined && dto.status !== prevStatus) {
      this.rabbitmqService.publishStatusChange({
        entity: 'payment',
        entityId: updated.id,
        orderId: Number(updated.orderId),
        status: updated.status,
        updatedAt: new Date().toISOString(),
      });
    }

    return updated;
  }

  async remove(id: number): Promise<void> {
    const payment = await this.findOne(id);
    await this.paymentRepository.remove(payment);
  }
}
