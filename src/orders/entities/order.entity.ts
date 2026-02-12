import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Payment } from '../../payments/entities/payment.entity';
import { Shipping } from '../../shipping/entities/shipping.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatus } from '../enums/order-status.enum';

@Entity('orders')
@Index('idx_orders_user_id', ['userId'])
export class Order {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'int', name: 'order_number', unique: true })
  @Generated('increment')
  orderNumber: number;

  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @Column({ type: 'int', name: 'address_id', nullable: true })
  addressId: number | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status_enum',
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'varchar', length: 120, name: 'idempotency_key', nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];

  @OneToMany(() => Payment, (payment) => payment.order)
  payments: Payment[];

  @OneToMany(() => Shipping, (shipping) => shipping.order)
  shipments: Shipping[];
}
