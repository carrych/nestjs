import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WsAppModule } from './ws-app.module';

async function bootstrap() {
  const app = await NestFactory.create(WsAppModule);
  app.enableShutdownHooks();
  const port = process.env.PORT ?? '3002';
  await app.listen(port);
  Logger.log(`WS service listening on :${port}`, 'WsService');
}

void bootstrap();
