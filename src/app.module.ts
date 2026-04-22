import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';

import { APP_CONFIG, ConfigModule } from './config/config.module';
import { Config } from './config/config';
import { AuthModule } from './auth/auth.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuditLogsService } from './audit-logs/audit-logs.service';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
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
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { InvoiceGeneratorModule } from './invoice-generator/invoice-generator.module';

@Module({
  imports: [
    HealthModule,
    ConfigModule,
    RabbitmqModule,
    InvoiceGeneratorModule,
    ScheduleModule.forRoot(),

    // ── Rate Limiting ────────────────────────────────────────────────
    // Two named throttlers — applied globally via CustomThrottlerGuard.
    // 'global'  — 100 req / 60 s  — baseline for all traffic
    // 'strict'  —   5 req / 60 s  — auth / payment / admin endpoints
    // Endpoints opt in to 'strict' via @Throttle({ strict: { ... } })
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: () => ({
        throttlers: [
          {
            name: 'global',
            ttl: Number(process.env.THROTTLE_GLOBAL_TTL ?? 60_000),
            limit: Number(process.env.THROTTLE_GLOBAL_LIMIT ?? 100),
          },
          {
            name: 'strict',
            ttl: Number(process.env.THROTTLE_STRICT_TTL ?? 60_000),
            limit: Number(process.env.THROTTLE_STRICT_LIMIT ?? 5),
          },
        ],
      }),
    }),

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
    // Rate limiting — applied globally before any guard/handler
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    // Audit logging — fires after every mutating HTTP request
    {
      provide: APP_INTERCEPTOR,
      useFactory: (auditLogsService: AuditLogsService, reflector: Reflector) =>
        new AuditLogInterceptor(auditLogsService, reflector),
      inject: [AuditLogsService, Reflector],
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Attach X-Request-ID to every incoming request
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
