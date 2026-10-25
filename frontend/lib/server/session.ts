import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/types";
import { SESSION_COOKIE, readSessionToken, signSession } from "./session-token";
import { ACCESS_COOKIE, backendEnabled, backendUser } from "./backend-client";

export async function getSession() {
  const jar = await cookies();
  if (backendEnabled()) return backendUser(jar.get(ACCESS_COOKIE)?.value);
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

const MFA_PENDING_COOKIE = "zenex_mfa_pending";

export async function setMfaChallengeCookie(user: SessionUser) {
  const jar = await cookies();
  jar.set(MFA_PENDING_COOKIE, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
}

export async function getMfaChallenge() {
  const jar = await cookies();
  return readSessionToken(jar.get(MFA_PENDING_COOKIE)?.value);
}

export async function clearMfaChallengeCookie() {
  const jar = await cookies();
  jar.delete(MFA_PENDING_COOKIE);
}

export async function setSessionCookie(user: SessionUser) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_PENDING_COOKIE);
}
