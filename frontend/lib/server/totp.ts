import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function toBase32(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function fromBase32(secret: string) {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of secret.toUpperCase().replace(/=+$/g, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid authenticator secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret() {
  return toBase32(randomBytes(20));
}

function codeAt(secret: string, counter: number) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", fromBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpCounter(secret: string, code: string, now = Date.now(), lastAccepted = -1) {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(now / 30_000);
  const given = Buffer.from(code);
  for (const shift of [-1, 0, 1]) {
    const matchedCounter = counter + shift;
    if (matchedCounter <= lastAccepted) continue;
    const expected = Buffer.from(codeAt(secret, matchedCounter));
    if (given.length === expected.length && timingSafeEqual(given, expected)) return matchedCounter;
  }
  return null;
}

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  return verifyTotpCounter(secret, code, now) !== null;
}

export function totpProvisioningUri(secret: string, email: string) {
  const label = encodeURIComponent(`Zenex International:${email}`);
  const query = new URLSearchParams({ secret, issuer: "Zenex International", algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${query.toString()}`;
}
