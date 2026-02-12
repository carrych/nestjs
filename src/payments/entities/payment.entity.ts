import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Order } from '../../orders/entities/order.entity';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentType } from '../enums/payment-type.enum';

@Entity('payments')
@Index('idx_payments_order_id', ['orderId'])
export class Payment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint', name: 'order_id' })
  orderId: number;

  @ManyToOne(() => Order, (order) => order.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @Column({ type: 'text', name: 'transaction_number', nullable: true })
  transactionNumber: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column('numeric', { precision: 12, scale: 2, default: 0.0 })
  amount: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payment_status_enum',
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({
    type: 'enum',
    enum: PaymentType,
    enumName: 'payment_type_enum',
    default: PaymentType.IN,
  })
  type: PaymentType;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_method_enum',
  })
  method: PaymentMethod;
}
