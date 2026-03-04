import 'dotenv/config';
import AppDataSource from '../../data-source';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Shipping } from '../shipping/entities/shipping.entity';
import { Stock } from '../stocks/entities/stock.entity';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { PaymentType } from '../payments/enums/payment-type.enum';
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { ShippingStatus } from '../shipping/enums/shipping-status.enum';

const productsSeed: Partial<Product>[] = [
  {
    name: 'iPhone 15 Pro',
    slug: 'iphone-15-pro',
    brand: 'Apple',
    visible: true,
    popular: true,
    waitForPrice: false,
    published: true,
    shortDescription: 'Flagship smartphone with A17 Pro chip',
    price: '49999.00',
    oldPrice: '54999.00',
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    slug: 'samsung-galaxy-s24-ultra',
    brand: 'Samsung',
    visible: true,
    popular: true,
    waitForPrice: false,
    published: true,
    shortDescription: 'Premium Android smartphone with S Pen',
    price: '47999.00',
    oldPrice: '51999.00',
  },
  {
    name: 'MacBook Air M3',
    slug: 'macbook-air-m3',
    brand: 'Apple',
    visible: true,
    popular: false,
    waitForPrice: false,
    published: true,
    shortDescription: 'Lightweight laptop with M3 chip',
    price: '52999.00',
  },
  {
    name: 'Sony WH-1000XM5',
    slug: 'sony-wh-1000xm5',
    brand: 'Sony',
    visible: true,
    popular: false,
    waitForPrice: false,
    published: true,
    shortDescription: 'Wireless noise-cancelling headphones',
    price: '12999.00',
    oldPrice: '14999.00',
  },
  {
    name: 'Logitech MX Master 3S',
    slug: 'logitech-mx-master-3s',
    brand: 'Logitech',
    visible: true,
    popular: false,
    waitForPrice: false,
    published: true,
    shortDescription: 'Ergonomic wireless mouse',
    price: '4299.00',
  },
];

async function seed() {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SEED) {
    throw new Error('Seeding is disabled in production. Set ALLOW_SEED=true to override.');
  }

  await AppDataSource.initialize();
  console.log('DataSource initialized');

  try {
    const productRepo = AppDataSource.getRepository(Product);
    const orderRepo = AppDataSource.getRepository(Order);
    const orderItemRepo = AppDataSource.getRepository(OrderItem);
    const paymentRepo = AppDataSource.getRepository(Payment);
    const shippingRepo = AppDataSource.getRepository(Shipping);
    const stockRepo = AppDataSource.getRepository(Stock);

    // ── Products ──
    await productRepo.upsert(productsSeed, ['slug']);
    const products = await productRepo.find({ order: { id: 'ASC' } });
    console.log(`Seeded ${products.length} products`);

    // ── Stocks ──
    const stocksSeed: Partial<Stock>[] = products.map((p, i) => ({
      productId: p.id,
      stock: (i + 1) * 20,
      reserved: i * 2,
    }));
    await stockRepo.upsert(stocksSeed, ['productId']);
    console.log(`Seeded ${stocksSeed.length} stock records`);

    // ── Orders ──
    // Insert orders one by one to let SERIAL generate order_number
    const ordersData = [
      { userId: 1, status: OrderStatus.COMPLETE },
      { userId: 1, status: OrderStatus.PENDING },
      { userId: 2, status: OrderStatus.PROCESSING },
      { userId: 3, status: OrderStatus.PENDING },
      { userId: 2, status: OrderStatus.CANCELED },
    ];

    const orders: Order[] = [];
    for (const data of ordersData) {
      const order = orderRepo.create(data);
      orders.push(await orderRepo.save(order));
    }
    console.log(`Seeded ${orders.length} orders`);

    // ── Order Items ──
    const orderItemsSeed: Partial<OrderItem>[] = [
      { orderId: orders[0].id, productId: products[0].id, amount: 1, price: '49999.00', discount: '0.00' },
      { orderId: orders[0].id, productId: products[3].id, amount: 2, price: '12999.00', discount: '500.00' },
      { orderId: orders[1].id, productId: products[2].id, amount: 1, price: '52999.00', discount: '0.00' },
      { orderId: orders[2].id, productId: products[1].id, amount: 1, price: '47999.00', discount: '2000.00' },
      { orderId: orders[2].id, productId: products[4].id, amount: 3, price: '4299.00', discount: '0.00' },
      { orderId: orders[3].id, productId: products[0].id, amount: 2, price: '49999.00', discount: '1000.00' },
      { orderId: orders[3].id, productId: products[3].id, amount: 1, price: '12999.00', discount: '0.00' },
      { orderId: orders[3].id, productId: products[4].id, amount: 1, price: '4299.00', discount: '0.00' },
      { orderId: orders[4].id, productId: products[1].id, amount: 1, price: '47999.00', discount: '0.00' },
    ];

    const items = orderItemRepo.create(orderItemsSeed);
    await orderItemRepo.save(items);
    console.log(`Seeded ${items.length} order items`);

    // ── Payments ──
    const paymentsSeed: Partial<Payment>[] = [
      {
        orderId: orders[0].id,
        userId: 1,
        transactionNumber: 'TXN-001',
        amount: '75497.00',
        status: PaymentStatus.RECEIVED,
        type: PaymentType.IN,
        method: PaymentMethod.BANK_TRANSFER,
      },
      {
        orderId: orders[2].id,
        userId: 2,
        transactionNumber: 'TXN-002',
        amount: '58896.00',
        status: PaymentStatus.PENDING,
        type: PaymentType.IN,
        method: PaymentMethod.CASH_ON_DELIVERY,
      },
      {
        orderId: orders[4].id,
        userId: 2,
        transactionNumber: 'TXN-003',
        amount: '47999.00',
        status: PaymentStatus.FAILED,
        type: PaymentType.IN,
        method: PaymentMethod.CASH,
      },
    ];

    const payments = paymentRepo.create(paymentsSeed);
    await paymentRepo.save(payments);
    console.log(`Seeded ${payments.length} payments`);

    // ── Shipping ──
    const shippingSeed: Partial<Shipping>[] = [
      {
        orderId: orders[0].id,
        userId: 1,
        trackingNumber: 'NP-20450001234567',
        declaredValue: '75497.00',
        shippingCost: '150.00',
        weight: '0.650',
        seatsCount: 2,
        status: ShippingStatus.RECEIVED,
        receivedAt: new Date('2025-01-20'),
      },
      {
        orderId: orders[2].id,
        userId: 2,
        trackingNumber: 'NP-20450009876543',
        declaredValue: '58896.00',
        shippingCost: '120.00',
        weight: '1.200',
        seatsCount: 1,
        status: ShippingStatus.DELIVERING,
      },
      {
        orderId: orders[3].id,
        userId: 3,
        declaredValue: '116296.00',
        shippingCost: '200.00',
        weight: '0.900',
        seatsCount: 3,
        status: ShippingStatus.PENDING,
      },
    ];

    const shipments = shippingRepo.create(shippingSeed);
    await shippingRepo.save(shipments);
    console.log(`Seeded ${shipments.length} shipping records`);

    console.log('Seeding completed successfully');
  } finally {
    await AppDataSource.destroy();
  }
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
