import { cookies } from 'next/headers';
import { ACCESS_COOKIE, backendFetch } from './backend-client';

export type CurrentAccount = {
  id: string; accountHolder: string; username: string; email: string | null;
  role: string; status: string; createdAt: string; lastSuccessfulLogin: string | null;
  security?: { mfaEnabled: boolean; mfaMethod: string | null; mfaStatus: string };
};

export async function currentBackendAccount(): Promise<CurrentAccount> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const response = await backendFetch('/account/me', token);
  if (!response.ok) throw new Error('Account information is temporarily unavailable. Please retry.');
  return response.json() as Promise<CurrentAccount>;
}
