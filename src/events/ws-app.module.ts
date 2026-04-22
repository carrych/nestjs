import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { RabbitmqModule } from '../rabbitmq/rabbitmq.module';
import { EventsModule } from './events.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
      }),
    }),
    RabbitmqModule,
    EventsModule,
  ],
})
export class WsAppModule {}
