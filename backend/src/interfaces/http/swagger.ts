import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** API documentation is served outside production only: it maps the whole attack surface. */
export function isSwaggerEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}

export function setupSwagger(
  app: INestApplication,
  nodeEnv: string | undefined,
): void {
  if (!isSwaggerEnabled(nodeEnv)) {
    return;
  }
  const config = new DocumentBuilder()
    .setTitle('Home Remote MCPs')
    .setDescription(
      'Gateway MCP distant personnel (auth via home-auth) - module Garmin Connect',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
