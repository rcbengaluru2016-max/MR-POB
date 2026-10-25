import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ConsoleLogger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const config = new ConfigService();
  config.validate();
  if (config.optional('SENTRY_DSN')) {
    const sentry = await import('@sentry/node');
    sentry.init({ dsn: config.optional('SENTRY_DSN'), environment: config.get('NODE_ENV'), sendDefaultPii: false, beforeSend(event) { delete event.request; delete event.user; delete event.breadcrumbs; return event; } });
  }
  const app = await NestFactory.create(AppModule, { logger: new ConsoleLogger({ json: true }), bodyParser: true });
  configureApp(app, config.optional('ENABLE_SWAGGER') === 'true');
  app.enableShutdownHooks();
  await app.listen(Number(config.get('PORT')), '0.0.0.0');
}
void bootstrap().catch(() => { process.stderr.write('Backend startup failed; check required configuration and database connectivity.\n'); process.exitCode = 1; });
