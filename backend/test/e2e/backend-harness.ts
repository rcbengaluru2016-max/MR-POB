// This isolated test harness is never included in production dist or Docker images.
import 'reflect-metadata';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { TestCognito } from '../fixtures/cognito';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ErpUser } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { S3StorageService } from '../../src/documents/s3-storage.service';
import { startTestDatabase } from '../integration/database';

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.IDEMPOTENCY_SECRET = 'browser-test-only-secret-at-least-32-characters';
  process.env.COGNITO_USER_POOL_ID = 'ap-southeast-2_testpool';
  process.env.COGNITO_CLIENT_ID = 'testclient';
  process.env.AWS_REGION = 'ap-southeast-2';
  process.env.S3_BUCKET = 'zenex-international-mrpob';
  const database = await startTestDatabase();
  const cognito = new TestCognito();
  Object.defineProperty(CognitoIdentityProviderClient.prototype, "send", { value: cognito.send, configurable: true });
  let administrator: ErpUser;
  let officer: ErpUser;
  let ordinary: ErpUser;
  let prisma: PrismaService;
  const session = (user = administrator) => ({username: user.username, displayName: user.displayName, userType: user.role === 'SUPER_ADMIN' ? 'super_admin' : user.role.toLowerCase()});
  const objects = new Map<string, Buffer>();
  const module = await Test.createTestingModule({imports: [AppModule]})
    .overrideProvider(S3StorageService).useValue({
      put: async (key: string, bytes: Buffer) => {objects.set(key, bytes); return {versionId: 'browser-test-version'};},
      remove: async (key: string) => {objects.delete(key);},
      signedDownload: async (key: string) => `https://private-s3.example.test/${encodeURIComponent(key)}?expires=60`,
      healthy: async () => true,
    }).compile();
  const app = module.createNestApplication();
  configureApp(app, true);
  await app.init();
  prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent", "Document", "CustomerAddress", "CustomerRegistration", "CompanyRegistration", "PatientRegistration", "Registration", "UploadObject", "UploadBatch", "ErpUser" CASCADE');
  administrator = await prisma.erpUser.create({data: {cognitoSub: 'browser-admin-sub', username: 'browser-admin', displayName: 'Browser Administrator', role: 'SUPER_ADMIN', state: 'ACTIVE'}});
  officer = await prisma.erpUser.create({data: {cognitoSub: 'browser-officer-sub', username: 'browser-officer', displayName: 'Browser Officer', role: 'ADMIN', state: 'ACTIVE'}});
  ordinary = await prisma.erpUser.create({data: {cognitoSub: 'browser-patient-sub', username: 'browser-patient', displayName: 'Browser Patient User', role: 'PATIENT', state: 'ACTIVE'}});
  for (const user of [administrator, officer, ordinary]) cognito.seed(user.username, user.cognitoSub!, 'BrowserPass123');
  app.get(AuthService).authenticate = async token => {
    const user = await prisma.erpUser.findUnique({where:{cognitoSub:token}});
    if (!user || user.state !== 'ACTIVE') throw new ForbiddenException();
    return user;
  };
  await app.listen(3201, '127.0.0.1');
  const shutdown = async () => {await app.close(); await database.stop(); process.exit(0);};
  process.once('SIGINT', () => {void shutdown();});
  process.once('SIGTERM', () => {void shutdown();});
}
void main().catch(error => {console.error(error); process.exit(1);});
