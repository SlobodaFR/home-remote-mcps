import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { setupSwagger } from './interfaces/http/swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? true,
    credentials: true,
  });

  setupSwagger(app, process.env.NODE_ENV);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();
