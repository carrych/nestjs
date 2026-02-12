import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
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
    const { limit = 10, offset = 0, orderId, status } = query;
    const where: Record<string, unknown> = {};

    if (orderId) where.orderId = orderId;
    if (status) where.status = status;

    return this.paymentRepository.find({
      where,
      relations: { order: true },
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
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

    if (dto.amount !== undefined) {
      payment.amount = String(dto.amount);
    }
    if (dto.status !== undefined) payment.status = dto.status;
    if (dto.type !== undefined) payment.type = dto.type;
    if (dto.method !== undefined) payment.method = dto.method;
    if (dto.transactionNumber !== undefined) {
      payment.transactionNumber = dto.transactionNumber;
    }

    return this.paymentRepository.save(payment);
  }

  async remove(id: number): Promise<void> {
    const payment = await this.findOne(id);
    await this.paymentRepository.remove(payment);
  }
}
