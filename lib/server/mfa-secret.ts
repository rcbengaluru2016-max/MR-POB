import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getSessionSecret } from "@/lib/server/session-token";

const prefix = "enc:v1:";

function encryptionKey() {
  return createHash("sha256").update(getSessionSecret()).digest();
}

export function encryptMfaSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${prefix}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptMfaSecret(value: string) {
  if (!value.startsWith(prefix)) return value;
  const [ivText, tagText, dataText] = value.slice(prefix.length).split(".");
  if (!ivText || !tagText || !dataText) throw new Error("Stored authenticator secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedMfaSecret(value: string) {
  return value.startsWith(prefix);
}
