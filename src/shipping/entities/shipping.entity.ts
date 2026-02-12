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
import { ShippingStatus } from '../enums/shipping-status.enum';

@Entity('shipping')
@Index('idx_shipping_order_id', ['orderId'])
export class Shipping {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint', name: 'order_id' })
  orderId: number;

  @ManyToOne(() => Order, (order) => order.shipments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'int', name: 'user_id' })
  userId: number;

  @Column({ type: 'text', name: 'tracking_number', nullable: true })
  trackingNumber: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'received_at', nullable: true })
  receivedAt: Date | null;

  @Column('numeric', { precision: 12, scale: 2, name: 'declared_value', default: 0.0 })
  declaredValue: string;

  @Column('numeric', { precision: 12, scale: 2, name: 'shipping_cost', nullable: true, default: 0.0 })
  shippingCost: string | null;

  @Column('numeric', { precision: 10, scale: 3, nullable: true })
  weight: string | null;

  @Column({ type: 'int', name: 'seats_count', nullable: true, default: 1 })
  seatsCount: number | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ShippingStatus,
    enumName: 'shipping_status_enum',
    default: ShippingStatus.PENDING,
  })
  status: ShippingStatus;
}
