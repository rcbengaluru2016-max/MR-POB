import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollImport, terminalImportStatuses } from '../lib/import-polling.ts';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('polling backs off throttling and stops when processing completes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const received = [];
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) return new Response('{}', { status: 429, headers: { 'Retry-After': '60' } });
    return Response.json({ status: calls === 2 ? 'IMPORTING' : 'COMPLETED' });
  });
  const stop = pollImport('/progress', result => { received.push(result.status); return !terminalImportStatuses.has(result.status); });
  t.after(stop);
  await flush();
  t.mock.timers.tick(59999); await flush(); assert.equal(calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  t.mock.timers.tick(4999); await flush(); assert.equal(calls, 2);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 3);
  t.mock.timers.tick(120000); await flush(); assert.equal(calls, 3);
  assert.deepEqual(received, ['IMPORTING', 'COMPLETED']);
});

test('slow responses cannot overlap and unmount discards late results', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve;
  let calls = 0;
  let received = 0;
  t.mock.method(globalThis, 'fetch', () => { calls++; return new Promise(done => { resolve = done; }); });
  const stop = pollImport('/progress', () => { received++; return true; });
  t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1);
  stop(); resolve(Response.json({ status: 'IMPORTING' })); await flush();
  t.mock.timers.tick(60000); await flush();
  assert.equal(received, 0); assert.equal(calls, 1);
});

test('validation failure is terminal and access failures stop polling', async t => {
  assert.equal(terminalImportStatuses.has('VALIDATION_FAILED'), true);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const errors = [];
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: 'Session expired' }, { status: 401 }); });
  const stop = pollImport('/progress', () => assert.fail('Unauthorized response'), message => errors.push(message));
  t.after(stop);
  await flush(); t.mock.timers.tick(120000); await flush();
  assert.equal(calls, 1); assert.deepEqual(errors, ['Session expired']);
});
