import { createHmac, timingSafeEqual } from "node:crypto";
import { isUserType, type SessionUser } from "../types.ts";

export const SESSION_COOKIE = "zenex_session";

export function getSessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32 && !configured.includes("replace-with")) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set SESSION_SECRET to a random value of at least 32 characters before production use.");
  }
  return "dev-insecure-change-me";
}

export function signSession(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const user: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!user || typeof user !== "object") return null;
    const candidate = user as Partial<SessionUser>;
    if (typeof candidate.username !== "string" || typeof candidate.displayName !== "string" || typeof candidate.userType !== "string" || !isUserType(candidate.userType)) return null;
    return candidate as SessionUser;
  } catch {
    return null;
  }
}
