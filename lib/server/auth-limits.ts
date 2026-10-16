const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const globals = globalThis as typeof globalThis & {
  __zenexAuthAttempts?: Map<string, { count: number; firstAttempt: number; blockedUntil: number }>;
};
const attempts = globals.__zenexAuthAttempts ??= new Map();

export function isAuthRateLimited(key: string) {
  const current = attempts.get(key);
  if (!current) return false;
  const now = Date.now();
  if (current.blockedUntil > now) return true;
  if (now - current.firstAttempt > WINDOW_MS) attempts.delete(key);
  return false;
}

export function recordAuthFailure(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now - current.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: now, blockedUntil: 0 });
    return;
  }
  current.count += 1;
  if (current.count >= MAX_FAILURES) current.blockedUntil = now + WINDOW_MS;
}

export function clearAuthFailures(key: string) {
  attempts.delete(key);
}
