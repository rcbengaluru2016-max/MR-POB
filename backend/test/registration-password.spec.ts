import { hashRegistrationPassword, verifyRegistrationPassword } from '../src/auth/registration-password';

describe('registration credential preservation', () => {
  it('uses a salted one-way verifier and accepts only the original password', async () => {
    const password = 'OriginalCompanyPassword123';
    const first = await hashRegistrationPassword(password);
    const second = await hashRegistrationPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyRegistrationPassword(password, first)).toBe(true);
    expect(await verifyRegistrationPassword('DifferentPassword123', first)).toBe(false);
    expect(await verifyRegistrationPassword(password, 'malformed')).toBe(false);
  });
});
