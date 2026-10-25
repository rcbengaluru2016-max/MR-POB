import { Global, Injectable, Module } from '@nestjs/common';

@Injectable()
export class ConfigService {
  get(key: string): string {
    const defaults: Record<string, string> = {
      PORT: '3001', AWS_REGION: 'ap-southeast-2', S3_REGION: 'ap-south-1', S3_BUCKET: 'zenex-international-mrpob-files',
      FRONTEND_ORIGIN: 'http://localhost:3000', NODE_ENV: 'development',
    };
    const value = process.env[key] ?? defaults[key];
    if (!value) throw new Error(`Missing required environment variable: ${key}`);
    return value;
  }
  optional(key: string): string | undefined { return process.env[key] || undefined; }

  validate(): void {
    for (const key of ['WHATSAPP_LIVE_ENABLED', 'WHATSAPP_TEMPLATES_APPROVED', 'WHATSAPP_REJECTIONS_ENABLED', 'NOTIFICATION_WORKER_ENABLED']) {
      if (this.optional(key) && !['true', 'false'].includes(this.optional(key)!)) throw new Error(`Invalid boolean configuration: ${key}`);
    }
    if (this.optional('WHATSAPP_PROVIDER') && !['mock', 'atoz'].includes(this.optional('WHATSAPP_PROVIDER')!)) throw new Error('Invalid WHATSAPP_PROVIDER');
    if (this.optional('NOTIFICATION_WORKER_ENABLED') === 'true') {
      this.get('NOTIFICATION_SQS_URL'); this.get('NOTIFICATION_SQS_DLQ_URL');
    }
    this.get('DATABASE_URL');
    if (this.get('IDEMPOTENCY_SECRET').length < 32) throw new Error('IDEMPOTENCY_SECRET must contain at least 32 characters');
    this.get('COGNITO_USER_POOL_ID');
    this.get('COGNITO_CLIENT_ID');
    if (this.get('S3_REGION') !== 'ap-south-1' || this.get('S3_BUCKET') !== 'zenex-international-mrpob-files') {
      throw new Error('Use the Mumbai registration bucket zenex-international-mrpob-files');
    }
    if (this.optional('S3_ENDPOINT') && this.get('NODE_ENV') === 'production') throw new Error('Custom S3 endpoints are development-only');
    const origin = new URL(this.get('FRONTEND_ORIGIN'));
    if (this.get('NODE_ENV') === 'production' && origin.protocol !== 'https:') throw new Error('Production frontend origin must use HTTPS');
    const port = Number(this.get('PORT'));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  }
}

@Global()
@Module({ providers: [ConfigService], exports: [ConfigService] })
export class ConfigModule {}
