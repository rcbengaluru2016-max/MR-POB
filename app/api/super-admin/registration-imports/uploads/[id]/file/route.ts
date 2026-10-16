import { NextResponse } from "next/server";
import { decryptUploadFile } from "@/lib/server/upload-file";
import { isSuperAdminReady } from "@/lib/server/super-admin";
import { refreshStore } from "@/lib/server/store";

export const instant = false;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdminReady())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const store = await refreshStore();
  const upload = store.registrationUploads.find((item) => item.id === id);
  if (!upload) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  try {
    const file = decryptUploadFile(upload.originalFile);
    return new Response(file, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${upload.fileName.replace(/[\r\n"\\]/g, "_")}"`, "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The original upload file cannot be decrypted with the current application key." }, { status: 500 });
  }
}
