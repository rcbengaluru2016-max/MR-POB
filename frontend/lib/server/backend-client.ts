import type { SessionUser } from "@/lib/types";
import { isUserType } from "@/lib/types";

export const ACCESS_COOKIE = "zenex_backend_access";
export const CHALLENGE_COOKIE = "zenex_backend_challenge";
export const backendEnabled = () => Boolean(process.env.BACKEND_API_URL?.trim());

export async function backendFetch(path: string, token?: string, init: RequestInit = {}) {
  const base = process.env.BACKEND_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("Backend is not configured");
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${base}/api${path}`, { ...init, headers, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(15000) });
}

export async function backendUser(token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const response = await backendFetch("/auth/me", token);
    if (!response.ok) return null;
    const body = await response.json();
    const user = body.user ?? body;
    return typeof user.username === "string" && typeof user.displayName === "string" && isUserType(user.userType)
      ? {
        username: user.username, displayName: user.displayName, userType: user.userType,
        ...(typeof user.email === "string" ? { email: user.email } : {}),
        ...(typeof user.createdAt === "string" ? { createdAt: user.createdAt } : {}),
        ...(typeof user.lastLoginAt === "string" ? { lastLoginAt: user.lastLoginAt } : {}),
      } : null;
  } catch { return null; }
}

export async function backendAccountInactive(token?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await backendFetch('/auth/me', token);
    return response.status === 403 && (await response.json()).code === 'ACCOUNT_INACTIVE';
  } catch { return false; }
}
