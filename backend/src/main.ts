import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ConsoleLogger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { configureApp } from './bootstrap';
import { DatabaseSchemaMismatchError } from './database/schema-readiness';

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
  const port = Number(config.get('PORT'));
  try {
    await app.listen(port, '0.0.0.0');
    process.stdout.write(`Backend ready at http://localhost:${port}/api\n`);
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}
void bootstrap().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (error instanceof DatabaseSchemaMismatchError) {
    process.stderr.write(`Backend startup blocked: ${error.message}\n`);
  } else if (code === 'EADDRINUSE') {
    process.stderr.write(`Backend could not start: port ${process.env.PORT || '3001'} is already in use. Another backend may already be running. Stop that instance (Ctrl+C in its terminal), then run npm start again.\n`);
  } else {
    process.stderr.write('Backend startup failed; check required configuration and database connectivity.\n');
  }
  process.exitCode = 1;
});
