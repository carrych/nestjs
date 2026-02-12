import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { APP_CONFIG, ConfigModule } from './config/config.module';
import { Config } from './config/config';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { ShippingModule } from './shipping/shipping.module';
import { StocksModule } from './stocks/stocks.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Config) => ({
        type: 'postgres',
        host: config.database.host,
        port: config.database.port,
        username: config.database.user,
        password: config.database.password,
        database: config.database.name,
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    UserModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    StocksModule,
  ],
})
export class AppModule {}
