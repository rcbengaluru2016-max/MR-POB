import { ConfigService } from '../src/config/config.service';
import { AtoZWhatsAppProvider, MockWhatsAppProvider, ProviderFailure, WhatsAppGateway } from '../src/notifications/whatsapp.provider';
import { approvalMessage, NotificationsService, retryDelaySeconds, templateKey, templateVariable } from '../src/notifications/notifications.service';

describe('WhatsApp adapter safety and template mapping', () => {
  const message = { idempotencyKey: 'event-id', recipient: '+919876543210', template: 'mock:patient_registration_approved', payload: { registrationId: 'reg' } };
  const signal = new AbortController().signal;
  it('returns deterministic mock IDs without any network transport', async () => {
    const mock = new MockWhatsAppProvider();
    expect(await mock.send(message)).toEqual({ status: 'MOCKED', messageId: 'mock:event-id' });
    expect(await mock.send(message)).toEqual(await mock.send(message));
  });
  it.each(['customer', 'company', 'patient'] as const)('maps %s approval and rejection to distinct configuration variables', kind => {
    const approvedNames = { customer: 'customer_registration_approved', patient: 'patient_registration_approved', company: 'company_admin_approved' };
    expect(templateKey(kind, 'APPROVED')).toBe(approvedNames[kind]);
    expect(templateVariable(templateKey(kind, 'APPROVED'))).toBe(`WHATSAPP_TEMPLATE_${approvedNames[kind].toUpperCase()}`);
    expect(templateVariable(templateKey(kind, 'REJECTED'))).toBe('WHATSAPP_TEMPLATE_REGISTRATION_REJECTED');
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

  const profile = { masterCode: 'ZI10000', customer: { customerName: 'Customer Name' }, patient: { patientName: 'Patient Name' }, company: { adminFullName: 'Admin Name', companyName: 'Company Name' } };
  it.each([
    ['customer', ['Customer Name', 'ZI10000']],
    ['patient', ['Patient Name', 'ZI10000']],
    ['company', ['Admin Name', 'Company Name', 'ZI10000']],
  ] as const)('resolves the exact ordered %s approval variables from its profile', (kind, variables) => {
    const payload = approvalMessage(kind, profile);
    expect(payload.variables).toEqual(variables);
    expect(payload.message).toContain(`Dear ${variables[0]},`);
    expect(payload.message).toContain('ZI10000');
    if (kind === 'company') {
      expect(payload.message).toContain('Your Company Admin registration for Company Name has been approved.');
      expect(payload.message).toContain('Use this Master Code as your username, along with the password you created during registration, to log in to the application.');
    } else {
      expect(payload.message).toContain(`Your ${kind} registration has been approved successfully.`);
      expect(payload.message).toContain(`Your unique ${kind === 'customer' ? 'Customer' : 'Patient'} Master Code is: ZI10000`);
    }
  });
  it.each(['customer', 'patient', 'company'] as const)('uses the exact legacy %s Master Code in approval messages', kind => {
    const payload = approvalMessage(kind, { ...profile, masterCode: 'C01234' });
    expect(payload.variables.at(-1)).toBe('C01234');
    expect(payload.message).toContain('C01234');
  });
  it('refuses an approval message without a saved Master Code or matching profile', () => {
    expect(() => approvalMessage('patient', { ...profile, masterCode: null })).toThrow('saved Master Code');
    expect(() => approvalMessage('patient', { ...profile, masterCode: 'bad/code' })).toThrow('saved Master Code');
    expect(() => approvalMessage('patient', { ...profile, patient: null })).toThrow('profile is missing');
  });
  it.each(['customer', 'patient', 'company'] as const)('stores %s event using database profile data and registered destination only', async kind => {
    const create = jest.fn().mockImplementation(({ data }) => data);
    const tx: any = { registration: { findUniqueOrThrow: jest.fn().mockResolvedValue({ ...profile, passwordHash: 'private-credential' }) }, registrationNotification: { create } };
    const event = await NotificationsService.record(tx, { id: 'registration-id', kind, mobile: '9876543210' }, 'APPROVED');
    expect(event).toMatchObject({ recipient: '+919876543210', templateKey: templateKey(kind, 'APPROVED'), payload: { decision: 'APPROVED', variables: approvalMessage(kind, profile).variables } });
    expect(JSON.stringify(event)).not.toContain('private-credential');
    expect(tx.registration.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'registration-id' }, include: { customer: true, company: true, patient: true } });
  });
});
