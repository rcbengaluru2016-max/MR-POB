import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { HttpErrorFilter } from './common/http-error.filter';

export function configureApp(app: INestApplication, swagger = false) {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.setHeader('X-Request-ID', randomUUID());
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () => Logger.log(JSON.stringify({ event: 'http_request', requestId: res.getHeader('X-Request-ID'), method: req.method, status: res.statusCode, durationMs: Date.now() - started }), 'HTTP'));
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, validationError: { target: false, value: false } }));
  app.useGlobalFilters(new HttpErrorFilter());
  if (swagger) {
    const config = new DocumentBuilder().setTitle('Zenex Registration API').setDescription('Registration requests, private documents and administrator read access. Public submission never creates or activates an ERP account.').setVersion('1.0').addBearerAuth().build();
    const document = SwaggerModule.createDocument(app, config);
    // Swagger initialization includes an inline script. Relax CSP for documentation only.
    app.use('/api/docs', (_req: Request, res: Response, next: NextFunction) => { res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"); next(); });
    SwaggerModule.setup('api/docs', app, document);
  }
}
