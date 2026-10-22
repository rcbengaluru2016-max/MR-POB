import { ALLOWED_FILE_TYPES, MAX_FILE_BYTES } from "@/lib/constants";
import type { UploadedFile } from "@/lib/types";

export async function toUploadedFile(file: File, label: string): Promise<UploadedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${label} must be 5 MB or smaller`);
  }
  if (!ALLOWED_FILE_TYPES.includes(file.type as (typeof ALLOWED_FILE_TYPES)[number])) {
    throw new Error(`${label} must be JPG, PNG, WEBP, or PDF`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
  };
}

export function optionalUpload(file: File | undefined, label: string) {
  if (!file || file.size === 0) return Promise.resolve(undefined);
  return toUploadedFile(file, label);
}

export function requiredUpload(file: unknown, label: string) {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`${label} is required`);
  }
  return toUploadedFile(file, label);
}
