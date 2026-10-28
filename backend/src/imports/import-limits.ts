function bounded(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  return value;
}
export function importLimits() {
  return {
    documentBytes: bounded('IMPORT_DOCUMENT_MAX_BYTES', 5 * 1024 * 1024, 5 * 1024 * 1024),
    totalDocumentBytes: bounded('IMPORT_DOCUMENT_TOTAL_BYTES', 25 * 1024 * 1024, 25 * 1024 * 1024),
    archiveBytes: bounded('IMPORT_ARCHIVE_MAX_BYTES', 30 * 1024 * 1024, 30 * 1024 * 1024),
    workbookBytes: bounded('IMPORT_WORKBOOK_MAX_BYTES', 40 * 1024 * 1024, 40 * 1024 * 1024),
    concurrent: bounded('IMPORT_CONCURRENT_REQUESTS', 2, 4),
  };
}
