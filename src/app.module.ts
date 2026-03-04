import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { join } from 'path';

import { APP_CONFIG, ConfigModule } from './config/config.module';
import { Config } from './config/config';
import { AuthModule } from './auth/auth.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuditLogsService } from './audit-logs/audit-logs.service';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { FilesModule } from './files/files.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { ShippingModule } from './shipping/shipping.module';
import { StocksModule } from './stocks/stocks.module';
import { UserModule } from './user/user.module';
import { GraphqlOrdersModule } from './graphql/orders/graphql-orders.module';
import { GraphqlProductsModule } from './graphql/products/graphql-products.module';
import { GraphqlPaymentsModule } from './graphql/payments/graphql-payments.module';
import { GraphqlShippingModule } from './graphql/shipping/graphql-shipping.module';
import { GraphqlStocksModule } from './graphql/stocks/graphql-stocks.module';
import { GraphqlUsersModule } from './graphql/users/graphql-users.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    HealthModule,
    ConfigModule,
    ScheduleModule.forRoot(),
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
      // GRAPHQL_SCHEMA_PATH allows overriding the schema file location.
      // In distroless containers /tmp is the only writable path;
      // in dev/prod-alpine the default (process.cwd()/schema.gql) works fine.
      autoSchemaFile: process.env.GRAPHQL_SCHEMA_PATH ?? join(process.cwd(), 'schema.gql'),
      playground: true,
      path: '/graphql',
    }),
    AuthModule,
    AuditLogsModule,
    FilesModule,
    UserModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    StocksModule,
    GraphqlOrdersModule,
    GraphqlProductsModule,
    GraphqlPaymentsModule,
    GraphqlShippingModule,
    GraphqlStocksModule,
    GraphqlUsersModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useFactory: (auditLogsService: AuditLogsService, reflector: Reflector) =>
        new AuditLogInterceptor(auditLogsService, reflector),
      inject: [AuditLogsService, Reflector],
    },
  ],
})
export class AppModule {}
