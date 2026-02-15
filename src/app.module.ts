import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';

import { APP_CONFIG, ConfigModule } from './config/config.module';
import { Config } from './config/config';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { ShippingModule } from './shipping/shipping.module';
import { StocksModule } from './stocks/stocks.module';
import { UserModule } from './user/user.module';
import { GraphqlOrdersModule } from './graphql/orders/graphql-orders.module';

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
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'schema.gql'),
      playground: true,
      path: '/graphql',
    }),
    UserModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    StocksModule,
    GraphqlOrdersModule,
  ],
})
export class AppModule {}
