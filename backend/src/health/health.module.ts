import { Controller, Get, Header, Module, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService, DatabaseModule } from '../database/prisma.service';
import { DocumentsModule } from '../documents/documents.module';
import { S3StorageService } from '../documents/s3-storage.service';

@ApiTags('Health') @Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly storage: S3StorageService) {}
  @Get('live') @ApiOperation({ summary: 'Process liveness' })
  live() { return { status: 'ok' }; }
  @Get('ready') @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Database and private S3 readiness; contains no infrastructure details' })
  async ready() {
    try { await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.storage.healthy()]); return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException('Dependencies unavailable'); }
  }
}

@Module({ imports: [DatabaseModule, DocumentsModule], controllers: [HealthController] })
export class HealthModule {}
