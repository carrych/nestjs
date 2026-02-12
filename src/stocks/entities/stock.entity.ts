import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Product } from '../../products/entities/product.entity';

@Entity('stocks')
export class Stock {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint', name: 'product_id', unique: true })
  productId: number;

  @OneToOne(() => Product, (product) => product.stock, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  // CHECK (stock >= 0) enforced at DB level via migration
  @Column({ type: 'int', default: 0 })
  stock: number;

  // CHECK (reserved >= 0) enforced at DB level via migration
  @Column({ type: 'int', default: 0 })
  reserved: number;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
