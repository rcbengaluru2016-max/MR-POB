import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');
  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const payload = error instanceof HttpException ? error.getResponse() : undefined;
    const message = typeof payload === 'string' ? payload : (payload as { message?: string | string[] })?.message;
    if (status >= 500) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'INTERNAL_ERROR';
      this.logger.error(JSON.stringify({ event: 'request_failed', requestId: response.getHeader('X-Request-ID'), status, code }));
      if (process.env.SENTRY_DSN) void import('@sentry/node').then(sentry => sentry.captureException(new Error(`Backend request failed (${code})`))).catch(() => undefined);
    }
    response.status(status).json({ statusCode: status, error: status >= 500 ? 'Service temporarily unavailable' : Array.isArray(message) ? message[0] : message ?? 'Request failed',
      ...(Array.isArray(message) ? { messages: message } : {}), requestId: response.getHeader('X-Request-ID') });
  }
}
