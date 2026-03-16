import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import AppDataSource from '../data-source';

async function bootstrap() {
  await AppDataSource.initialize();
  const pending = await AppDataSource.showMigrations();
  if (pending) {
    Logger.log('Running pending migrations...', 'Migrations');
    await AppDataSource.runMigrations();
    Logger.log('Migrations complete', 'Migrations');
  }
  await AppDataSource.destroy();

  const app = await NestFactory.create(AppModule, {
    cors: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);

  Logger.log(`🚀App listening on port ${await app.getUrl()}🚀`);
}

bootstrap();
