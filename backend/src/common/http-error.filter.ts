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
    const accountCredentialsUnavailable = status === 503 && (error as { code?: string })?.code === 'ACCOUNT_AWS_CREDENTIALS_UNAVAILABLE';
    const inactiveAdmin = status === 403 && typeof payload === 'object' && (payload as { code?: string })?.code === 'ACCOUNT_INACTIVE';
    if (status >= 500) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'INTERNAL_ERROR';
      this.logger.error(JSON.stringify({ event: 'request_failed', requestId: response.getHeader('X-Request-ID'), status, code }));
      if (process.env.SENTRY_DSN) void import('@sentry/node').then(sentry => sentry.captureException(new Error(`Backend request failed (${code})`))).catch(() => undefined);
    }
    response.status(status).json({ statusCode: status, error: accountCredentialsUnavailable ? 'AWS authentication is unavailable. Renew the backend AWS session and retry account creation.' : status >= 500 ? 'Service temporarily unavailable' : Array.isArray(message) ? message[0] : message ?? 'Request failed',
      ...(accountCredentialsUnavailable ? { code: 'ACCOUNT_AWS_CREDENTIALS_UNAVAILABLE' } : {}),
      ...(inactiveAdmin ? { code: 'ACCOUNT_INACTIVE' } : {}),
      ...(Array.isArray(message) ? { messages: message } : {}), requestId: response.getHeader('X-Request-ID') });
  }
}
