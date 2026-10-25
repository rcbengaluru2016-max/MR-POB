import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/database/prisma.service';
import { DocumentsService } from '../src/documents/documents.service';
import { S3StorageService } from '../src/documents/s3-storage.service';
import { RegistrationsService } from '../src/registrations/registrations.service';
import { patientInput } from './fixtures/registration-inputs';

describe('production registration rate limit', () => {
  let app: INestApplication;
  const submit = jest.fn().mockResolvedValue({ registrationId: 'REG-PAT-throttle', status: 'PENDING' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(AuthService).useValue({})
      .overrideProvider(S3StorageService).useValue({})
      .overrideProvider(DocumentsService).useValue({})
      .overrideProvider(RegistrationsService).useValue({ submit })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app, true);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it('rejects the eleventh same-source submission before invoking persistence', async () => {
    for (let index = 0; index < 11; index++) {
      let call = request(app.getHttpServer()).post('/api/registrations/patients');
      for (const [key, value] of Object.entries(patientInput())) call = call.field(key, String(value));
      await call.expect(index < 10 ? 201 : 429);
    }
    expect(submit).toHaveBeenCalledTimes(10);
  });
  it('publishes multipart contracts and bearer authorization in its OpenAPI document', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    for (const kind of ['customers', 'companies', 'patients']) {
      const operation = body.paths[`/api/registrations/${kind}`].post;
      expect(operation.requestBody.content['multipart/form-data']).toBeDefined();
      expect(operation.responses['409']).toBeDefined();
      expect(operation.responses['415']).toBeDefined();
    }
    expect(body.paths['/api/admin/registrations'].get.security).toEqual([{ bearer: [] }]);
    expect(body.paths['/api/super-admin/accounts'].post.security).toEqual([{ bearer: [] }]);
    expect(body.paths['/api/super-admin/accounts'].get.responses['200'].content['application/json'].schema.properties.items.type).toBe('array');
    expect(body.components.schemas.CreateAdminDto.properties.password.writeOnly).toBe(true);
    expect(body.components.schemas.CreateAdminDto.properties.role.enum).toEqual(['ADMIN']);
    expect(body.paths['/api/admin/registrations/analytics'].get).toBeDefined();
    expect(body.paths['/api/admin/registrations/{id}/decision'].post).toBeDefined();
    expect(body.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
  });
});
