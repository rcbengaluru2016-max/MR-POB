// Creates one clearly labelled pending test Customer in the configured local app.
// Uses the real frontend, backend, PostgreSQL and private S3 transport. No approval
// or message is triggered. Keep the saved ID for review in Registration Approvals.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomInt, randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

async function main() {
  const database = new URL(process.env.DATABASE_URL);
  const frontend = new URL(process.env.FRONTEND_ORIGIN || 'http://localhost:3000');
  const loopback = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  assert.ok(process.env.NODE_ENV !== 'production' && loopback(database.hostname) && database.port === '15432' && database.pathname === '/zenex', 'This smoke test requires the configured local development database');
  assert.ok(loopback(frontend.hostname), 'This smoke test requires a local frontend');
  const prisma = new PrismaClient();
  const s3 = new S3Client({ region: process.env.S3_REGION, maxAttempts: 1 });
  const run = randomUUID();
  const name = `Registration Storage Smoke Test ${run.slice(0, 8)}`;
  const fields = {
    customerName: name, mobile: `9${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`,
    email: `registration-smoke-${run}@example.test`, businessName: 'Synthetic Storage Test Pharmacy',
    customerType: 'Retail Pharmacy', addressLine1: 'Synthetic test address', pinCode: '560001',
    dlNumber1: `SMOKE-DL1-${run.slice(0, 8)}`, dlNumber2: `SMOKE-DL2-${run.slice(0, 8)}`,
    gstNumber: `SMOKE-GST-${run}`, creditDays: 'week_2', paymentMethod: 'UPI', termsAccepted: 'true',
  };
  try {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const pdfBytes = Buffer.from(await pdf.save());
    const image = sharp({ create: { width: 4, height: 4, channels: 3, background: '#123daa' } });
    const uploads = [
      ['dl1', await image.clone().png().toBuffer(), 'image/png', 'png'],
      ['dl2', pdfBytes, 'application/pdf', 'pdf'],
      ['gstCertificate', pdfBytes, 'application/pdf', 'pdf'],
      ['shopOutside', await image.clone().jpeg().toBuffer(), 'image/jpeg', 'jpg'],
      ['shopInside', await image.clone().webp().toBuffer(), 'image/webp', 'webp'],
    ];
    async function submit() {
      const form = new FormData();
      for (const [field, value] of Object.entries(fields)) form.set(field, value);
      for (const [slot, bytes, type, extension] of uploads) form.set(slot, new Blob([bytes], { type }), `smoke-${slot}.${extension}`);
      return fetch(new URL('/api/register/customer', frontend), {
        method: 'POST', headers: { Origin: frontend.origin, 'Idempotency-Key': run },
        body: form, signal: AbortSignal.timeout(125000),
      });
    }
    const response = await submit();
    assert.equal(response.status, 201, `Customer submission returned HTTP ${response.status}`);
    const result = await response.json();
    assert.match(result.registrationId, /^REG-CUS-ZI\d{4,}$/);
    assert.equal(result.status, 'pending_verification');
    const id = result.registrationId;
    // Report the synthetic ID immediately so a later assertion cannot obscure a committed record.
    console.log(JSON.stringify({ registrationId: id, customerName: name, submissionHttpStatus: response.status }));
    const record = await prisma.registration.findUniqueOrThrow({ where: { id }, include: { customer: { include: { address: true } }, documents: true, audits: true } });
    assert.equal(record.status, 'PENDING');
    assert.equal(record.masterCode, null);
    assert.equal(record.ownerId, null);
    assert.equal(record.customer.customerName, name);
    assert.equal(record.customer.address.addressLine1, fields.addressLine1);
    assert.equal(record.documents.length, 5);
    assert.deepEqual(record.documents.map(file => file.slot).sort(), uploads.map(file => file[0]).sort());
    assert.equal(record.audits.filter(event => event.action === 'REGISTRATION_SUBMITTED').length, 1);
    const manifest = await prisma.uploadBatch.findUniqueOrThrow({ where: { registrationId: id } });
    assert.ok(manifest.completedAt);
    for (const document of record.documents) {
      const object = await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: document.objectKey, VersionId: document.versionId || undefined }), { abortSignal: AbortSignal.timeout(15000) });
      assert.equal(object.ContentLength, document.size);
      assert.equal(object.ContentType, document.contentType);
      assert.equal(object.Metadata.sha256, document.sha256);
      if (document.versionId) assert.equal(object.VersionId, document.versionId);
    }
    const replay = await submit();
    assert.equal(replay.status, 201);
    assert.equal((await replay.json()).registrationId, id);
    await prisma.$disconnect();
    await prisma.$connect();
    const persisted = await prisma.registration.findUniqueOrThrow({ where: { id }, include: { customer: true, documents: true } });
    assert.equal(persisted.customer.customerName, name);
    assert.equal(persisted.documents.length, 5);
    assert.equal(await prisma.registration.count({ where: { idempotencyKey: record.idempotencyKey } }), 1);
    assert.equal(await prisma.registrationNotification.count({ where: { registrationId: id } }), 0);
    console.log(JSON.stringify({ success: true, registrationId: id, status: persisted.status, documentsStoredAndVerifiedInS3: 5, formats: ['PNG', 'PDF', 'JPEG', 'WEBP'], idempotencyReplay: 'passed', databaseReconnect: 'passed', notificationsCreated: 0 }));
  } finally {
    await prisma.$disconnect();
    s3.destroy();
  }
}
main().catch(error => {
  console.error(JSON.stringify({ success: false, code: error.code || error.name, ...(error instanceof assert.AssertionError ? { reason: error.message } : {}) }));
  process.exitCode = 1;
});
