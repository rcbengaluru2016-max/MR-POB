import { timingSafeEqual } from "node:crypto";

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createSalt() {
  return crypto.randomUUID().replaceAll("-", "");
}

export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const digest = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 310_000, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2-sha256$310000$${toHex(digest)}`;
}

export function isCurrentPasswordHash(passwordHash: string) {
  return passwordHash.startsWith("pbkdf2-sha256$");
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
) {
  if (!isCurrentPasswordHash(expectedHash)) {
    const legacyDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${salt}:${password}`),
    );
    const legacy = toHex(legacyDigest);
    const left = Buffer.from(legacy);
    const right = Buffer.from(expectedHash);
    return left.length === right.length && timingSafeEqual(left, right);
  }
  const [, iterationsText, encodedHash] = expectedHash.split("$");
  const iterations = Number(iterationsText);
  if (iterations !== 310_000 || !/^[a-f0-9]{64}$/.test(encodedHash ?? "")) return false;
  const actual = await hashPassword(password, salt);
  const actualHash = actual.split("$")[2] ?? "";
  const left = Buffer.from(actualHash);
  const right = Buffer.from(encodedHash);
  return left.length === right.length && timingSafeEqual(left, right);
}
