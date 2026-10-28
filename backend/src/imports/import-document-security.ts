import { BadRequestException } from '@nestjs/common';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject, PDFRawStream } from 'pdf-lib';

// Inspect parsed names rather than raw PDF text: compressed objects and escaped names
// must not hide active actions or nested payloads from import security checks.
export async function checkImportDocumentSafety(files: Express.Multer.File[]) {
  for (const file of files) {
    if (file.buffer.subarray(0, 5).toString() !== '%PDF-') continue;
    try {
      const pdf = await PDFDocument.load(file.buffer, { throwOnInvalidObject: true, updateMetadata: false });
      const forbidden = new Set(['JavaScript', 'JS', 'Launch', 'EmbeddedFile', 'EmbeddedFiles', 'OpenAction', 'AA', 'RichMedia', 'XFA', 'SubmitForm', 'ImportData', 'GoToR']);
      const seen = new Set<PDFObject>();
      const inspect = (object: PDFObject, depth = 0): void => {
        if (seen.has(object)) return;
        if (depth > 50) throw new Error('PDF nesting limit');
        seen.add(object);
        if (object instanceof PDFName && forbidden.has(object.decodeText())) throw new Error('Active PDF content');
        if (object instanceof PDFDict) for (const [key, value] of object.entries()) { inspect(key, depth + 1); inspect(value, depth + 1); }
        else if (object instanceof PDFArray) for (const value of object.asArray()) inspect(value, depth + 1);
        else if (object instanceof PDFRawStream) inspect(object.dict, depth + 1);
      };
      for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object);
    } catch { throw new BadRequestException('PDF document is corrupted or contains unsupported active content or embedded files'); }
  }
}
