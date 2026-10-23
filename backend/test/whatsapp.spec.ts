import { ConfigService } from '../src/config/config.service';
import { AtoZWhatsAppProvider, MockWhatsAppProvider, ProviderFailure, WhatsAppGateway } from '../src/notifications/whatsapp.provider';
import { retryDelaySeconds, templateKey, templateVariable } from '../src/notifications/notifications.service';

describe('WhatsApp adapter safety and template mapping', () => {
  const message = { idempotencyKey: 'event-id', recipient: '+919876543210', template: 'mock:registration.patient.approved', payload: { registrationId: 'reg' } };
  const signal = new AbortController().signal;
  it('returns deterministic mock IDs without any network transport', async () => {
    const mock = new MockWhatsAppProvider();
    expect(await mock.send(message)).toEqual({ status: 'MOCKED', messageId: 'mock:event-id' });
    expect(await mock.send(message)).toEqual(await mock.send(message));
  });
  it.each(['customer', 'company', 'patient'] as const)('maps %s approval and rejection to distinct configuration variables', kind => {
    expect(templateVariable(templateKey(kind, 'APPROVED'))).toBe(`WHATSAPP_TEMPLATE_REGISTRATION_${kind.toUpperCase()}_APPROVED`);
    expect(templateVariable(templateKey(kind, 'REJECTED'))).toBe(`WHATSAPP_TEMPLATE_REGISTRATION_${kind.toUpperCase()}_REJECTED`);
  });
  it.each([
    [{}, 'MOCKED'],
    [{ WHATSAPP_PROVIDER: 'mock', WHATSAPP_LIVE_ENABLED: 'false' }, 'MOCKED'],
    [{ WHATSAPP_PROVIDER: 'mock', WHATSAPP_LIVE_ENABLED: 'true' }, 'LIVE_MESSAGING_DISABLED'],
    [{ WHATSAPP_PROVIDER: 'atoz', WHATSAPP_LIVE_ENABLED: 'false' }, 'LIVE_MESSAGING_DISABLED'],
    [{ WHATSAPP_PROVIDER: 'atoz', WHATSAPP_LIVE_ENABLED: 'true' }, 'ATOZ_DOCUMENTATION_REQUIRED'],
  ])('fails closed for configuration %j', async (env, expected) => {
    const config = { optional: (key: string) => (env as Record<string, string>)[key] } as ConfigService;
    const gateway = new WhatsAppGateway(config, new MockWhatsAppProvider(), new AtoZWhatsAppProvider());
    if (expected === 'MOCKED') expect((await gateway.send(message, signal)).status).toBe('MOCKED');
    else await expect(gateway.send(message, signal)).rejects.toMatchObject({ disposition: 'blocked', code: expected });
  });
  it('always blocks the undocumented AtoZ transport', async () => {
    await expect(new AtoZWhatsAppProvider().send()).rejects.toBeInstanceOf(ProviderFailure);
  });
  it('bounds exponential retry delays', () => {
    expect([1, 2, 3, 4, 5].map(retryDelaySeconds)).toEqual([30, 60, 120, 240, 480]);
    expect(retryDelaySeconds(500)).toBe(3600);
  });
});
