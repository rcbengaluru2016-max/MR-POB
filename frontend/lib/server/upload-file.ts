import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getSessionSecret } from "@/lib/server/session-token";

function key() {
  return createHash("sha256").update(getSessionSecret()).digest();
}

export function encryptUploadFile(data: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return { iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

export function decryptUploadFile(value: { iv: string; tag: string; ciphertext: string }) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(value.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]);
}
