import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { OrderItem } from '../../orders/entities/order-item.entity';
import { Stock } from '../../stocks/entities/stock.entity';

@Entity('products')
@Index('idx_products_slug', ['slug'], { unique: true })
@Index('idx_products_brand', ['brand'])
export class Product {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  brand: string | null;

  @Column({ type: 'boolean', default: true })
  visible: boolean;

  @Column({ type: 'boolean', default: false })
  popular: boolean;

  @Column({ type: 'boolean', name: 'wait_for_price', default: true })
  waitForPrice: boolean;

  @Column({ type: 'boolean', default: true })
  published: boolean;

  @Column({ type: 'text', name: 'short_description', nullable: true })
  shortDescription: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column('numeric', { precision: 12, scale: 2, default: 0.0 })
  price: string;

  @Column('numeric', { precision: 12, scale: 2, name: 'old_price', default: 0.0 })
  oldPrice: string;

  @Column('numeric', { precision: 12, scale: 2, name: 'special_price', default: 0.0 })
  specialPrice: string;

  @Column({ type: 'timestamptz', name: 'special_price_start_date', nullable: true })
  specialPriceStartDate: Date | null;

  @Column({ type: 'timestamptz', name: 'special_price_end_date', nullable: true })
  specialPriceEndDate: Date | null;

  @Column({ type: 'text', name: 'youtube_url', nullable: true })
  youtubeUrl: string | null;

  @Column({ type: 'int', name: 'seo_settings_id', nullable: true })
  seoSettingsId: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'image_file_id', type: 'uuid', nullable: true })
  imageFileId: string | null;

  @OneToMany(() => OrderItem, (item) => item.product)
  orderItems: OrderItem[];

  @OneToOne(() => Stock, (stock) => stock.product)
  stock: Stock;
}
