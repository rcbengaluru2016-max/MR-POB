import { validateRejection, rejectionReasons } from '../src/registrations/rejection-reasons';
import { rejectionMessage } from '../src/notifications/notifications.service';
import { RejectionRetentionService } from '../src/registrations/rejection-retention.service';
describe('rejection policy and retention scheduler', () => {
  it.each(Object.keys(rejectionReasons).filter(code => code !== 'OTHER'))('uses server-controlled copy for %s', code => {
    expect(validateRejection({ reasonCode: code, reason: 'internal data ignored' }).reason).toBe(rejectionReasons[code as keyof typeof rejectionReasons]);
  });
  it('requires applicable reasons and explicit review, rejects sensitive content, and normalizes whitespace', () => {
    for (const input of [{}, { reasonCode: 'OTHER', reason: 'Please correct the address' }, { reasonCode: 'OTHER', reasonReviewed: true, reason: 'a'.repeat(501) }, { reasonCode: 'OTHER', reasonReviewed: true, reason: 'Diagnosis is confidential' }, { reasonCode: 'OTHER', reasonReviewed: true, reason: 'Identity 1234567890 incorrect' }]) expect(() => validateRejection(input)).toThrow();
    expect(() => validateRejection({ reasonCode: 'MISSING_DOCUMENTS' }, 'patient')).toThrow('optional');
    expect(validateRejection({ reasonCode: 'OTHER', reasonReviewed: true, reason: ' Please   correct the address. ' }).reason).toBe('Please correct the address.');
  });
  it.each(['customer', 'company', 'patient'] as const)('maps %s to its applicant name and shared rejection copy', kind => {
    const profile = { masterCode: null, customer: { customerName: 'Customer name' }, company: { adminFullName: 'Admin name', companyName: 'Company' }, patient: { patientName: 'Patient name' }, rejectionReason: 'Submitted information is incomplete.' };
    const payload = rejectionMessage(kind, profile);
    expect(payload.variables).toEqual([{ customer: 'Customer name', company: 'Admin name', patient: 'Patient name' }[kind], { customer: 'Customer', company: 'Company Admin', patient: 'Patient' }[kind], profile.rejectionReason]);
    expect(payload.message).toContain('Please contact our support team if you require further clarification.');
  });
  it('runs automatically at startup and every minute, and stops with the service', async () => {
    jest.useFakeTimers();
    const service = new RejectionRetentionService({} as any);
    const cleanup = jest.spyOn(service, 'cleanup').mockResolvedValue(0);
    try {
      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      expect(cleanup).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(cleanup).toHaveBeenCalledTimes(2);
      await service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(cleanup).toHaveBeenCalledTimes(2);
    } finally { jest.useRealTimers(); }
  });
});
