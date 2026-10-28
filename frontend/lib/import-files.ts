export const SPREADSHEET_MAX_BYTES = 40 * 1024 * 1024;
export const DOCUMENT_ZIP_MAX_BYTES = 30 * 1024 * 1024;

/** Preliminary browser checks only; the backend independently parses and validates every byte. */
export async function validateImportFiles(spreadsheet: File, archive: File) {
  if (!/\.(xlsx|csv)$/i.test(spreadsheet.name)) throw new Error("Completed Excel File must be .xlsx or .csv.");
  if (!spreadsheet.size || spreadsheet.size > SPREADSHEET_MAX_BYTES) throw new Error("Choose a non-empty spreadsheet up to 40 MiB.");
  if (!/\.zip$/i.test(archive.name) || !archive.size || archive.size > DOCUMENT_ZIP_MAX_BYTES) throw new Error("Supporting Documents must be a .zip file up to 30 MiB.");
  const signature = (bytes: Uint8Array) => Array.from(bytes.slice(0, 4), byte => byte.toString(16).padStart(2, "0")).join("");
  const zipBytes = new Uint8Array(await archive.slice(0, 4).arrayBuffer());
  if (!["504b0304", "504b0506"].includes(signature(zipBytes))) throw new Error("Supporting Documents does not contain a ZIP archive.");
  const prefix = new Uint8Array(await spreadsheet.slice(0, 4096).arrayBuffer());
  if (/\.xlsx$/i.test(spreadsheet.name)) {
    if (signature(prefix) !== "504b0304") throw new Error("The selected .xlsx file does not contain an Excel workbook.");
  } else {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(prefix, { stream: spreadsheet.size > prefix.length }); }
    catch { throw new Error("CSV files must contain UTF-8 text."); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) || signature(prefix).startsWith("504b")) throw new Error("The selected .csv file contains binary data.");
  }
}
