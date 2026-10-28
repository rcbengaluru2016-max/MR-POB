import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { fromBuffer } from 'yauzl';
import { RegistrationKind } from '@prisma/client';
import { columns, safeFilename } from './import-schema';
import { importLimits } from './import-limits';
import { inspectRelationships, mailtoAddress } from './import-relationships';
// ExcelJS implements this range API but omits it from its Worksheet declaration.
declare module 'exceljs' {
  interface Worksheet { dataValidations: { add(address: string, validation: DataValidation): DataValidation } }
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_WORKBOOK_BYTES = 40 * 1024 * 1024;
// Inspect actual inflated bytes before ExcelJS parses XML. No ZIP data is written to disk.
export async function inspectArchive(bytes: Buffer) {
  if (!bytes.length || bytes.length > importLimits().workbookBytes) throw new BadRequestException('Workbook exceeds the configured limit (at most 40 MiB)');
  await new Promise<void>((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(new BadRequestException('Malformed XLSX archive')); return; }
      let entries = 0, expanded = 0, ended = false;
      const paths = new Set<string>();
      const fail = () => { if (!ended) { ended = true; clearTimeout(timer); zip.close(); reject(new BadRequestException('Unsafe or unsupported XLSX structure')); } };
      const timer = setTimeout(fail, 5000);
      const finish = () => clearTimeout(timer);
      zip.on('error', fail);
      zip.on('end', () => { finish(); if (!ended) { ended = true; resolve(); } });
      zip.on('close', finish);
      zip.on('entry', entry => {
        if (paths.has(entry.fileName)) { fail(); return; }
        paths.add(entry.fileName);
        if (++entries > 2000 || entry.uncompressedSize > 40 * 1024 * 1024 || (entry.generalPurposeBitFlag & 1) || /vba|externalLinks|embeddings|activeX/i.test(entry.fileName) || /(^\/|\.\.|\\)/.test(entry.fileName)) { fail(); return; }
        if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
        const media = /^xl\/media\/[A-Za-z0-9_.-]+\.(png|jpe?g|webp)$/i.test(entry.fileName);
        if (!media && !/\.(xml|rels)$/.test(entry.fileName)) { fail(); return; }
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) { fail(); return; }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => { expanded += chunk.length; if (expanded > 64 * 1024 * 1024) { stream.destroy(); fail(); } else chunks.push(chunk); });
          stream.on('error', fail);
          stream.on('end', () => {
            if (media) { if (!ended) zip.readEntry(); return; }
            const xml = Buffer.concat(chunks).toString('utf8');
            if (xml.includes('\u0000') || /<!DOCTYPE|<!ENTITY|<(?:\w+:)?f(?:\s|>|\/)|macroEnabled|vbaProject/i.test(xml)) { fail(); return; }
            if (entry.fileName.endsWith('.rels')) {
              try { inspectRelationships(xml, entry.fileName); } catch { fail(); return; }
            }
            if (!ended) zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
export async function parseImportWorkbook(kind: RegistrationKind, file: Express.Multer.File) {
  safeFilename(file.originalname);
  if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Only .xlsx workbooks are accepted');
  await inspectArchive(file.buffer);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]); }
  catch { throw new BadRequestException('Malformed XLSX workbook'); }
  const sheet = workbook.getWorksheet('Registrations');
  if (!sheet || workbook.worksheets.some(s => !['Registrations', 'Instructions', 'Attachments'].includes(s.name) || s.state !== 'visible') || sheet.model.merges?.length || sheet.columnCount > 40 || sheet.rowCount > 251) throw new BadRequestException('Use the category template with at most 250 rows and no hidden sheets or merged cells');
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(v => String(v ?? '').replace(/\s*\*$/, '').trim());
  const expected = columns(kind);
  if (new Set(headers).size !== headers.length || expected.some(c => !headers.includes(c)) || headers.some(c => !expected.includes(c))) throw new BadRequestException('Missing, repeated or unexpected template columns');
  if (workbook.worksheets.some(other => other !== sheet && other.getImages().length)) throw new BadRequestException('Images must belong to registration document cells');
  const rows: Record<string, string>[] = [];
  let lastDataRow = 1;
  sheet.eachRow(row => { if (row.number > 1 && (row.values as ExcelJS.CellValue[]).some(value => value !== null && value !== undefined && value !== '')) lastDataRow = row.number; });
  for (let n = 2; n <= lastDataRow; n++) {
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const cellValue = sheet.getRow(n).getCell(c + 1).value;
      let value = cellValue;
      if (cellValue && typeof cellValue === 'object' && 'hyperlink' in cellValue) {
        const address = mailtoAddress(cellValue.hyperlink);
        if (!['email', 'adminEmail'].includes(headers[c]) || typeof cellValue.text !== 'string' || !address || address.toLowerCase() !== cellValue.text.trim().toLowerCase()) throw new BadRequestException('Only matching email auto-links are supported in email columns; remove other hyperlinks');
        value = cellValue.text;
      }
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw new BadRequestException('Only plain text, numbers and booleans are supported');
      const text = value === null ? '' : String(value);
      if (text.length > 4096) throw new BadRequestException('Workbook cell exceeds processing limit');
      row[headers[c]] = text;
    }
    if (Object.values(row).some(Boolean)) rows.push(row);
    else throw new BadRequestException('Remove empty rows within the registration data');
  }
  if (!rows.length) throw new BadRequestException('Workbook contains no records');
  const files = extractAttachments(workbook, sheet, headers, rows);
  return { rows, files };
}
export async function template(kind: RegistrationKind) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Registrations');
  sheet.columns = columns(kind).map(key => ({ header: key, key, width: 24, style: { numFmt: '@' } }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const instructions = book.addWorksheet('Instructions');
  const { documentSlots } = await import('../documents/documents.service');
  const { getMetadataStorage } = await import('class-validator');
  const { registrationDtos } = await import('./import-schema');
  const metadata = getMetadataStorage().getTargetValidationMetadatas(registrationDtos[kind], '', false, false);
  for (const rule of metadata.filter(rule => rule.name === 'isIn')) {
    const choices = rule.constraints?.[0] as string[] | undefined;
    if (choices && choices.join(',').length < 250) {
      const letter = sheet.getColumn(rule.propertyName).letter;
      sheet.dataValidations.add(`${letter}2:${letter}251`, { type: 'list', allowBlank: true, formulae: [`"${choices.join(',')}"`], showErrorMessage: true, errorTitle: 'Choose a listed value', error: 'Select a value from the dropdown.' });
    }
  }
  instructions.addRows([
    ['Administrative import: approved accounts are created only after confirmation. Maximum 250 rows.'],
    ['Keep all headers. Use plain text cells. No formulas, web/file hyperlinks, macros, hidden or extra sheets. Matching email auto-links in email/adminEmail cells are imported as plain text.'],
    ['termsAccepted must be true and represents the applicant accepting the terms.'],
    ['Primary workflow: enter exact document basenames in the File columns, upload the spreadsheet (.xlsx or UTF-8 .csv) and a Supporting Documents ZIP together.'],
    ['ZIP: PDF/PNG/JPG/JPEG/WEBP, 5 MiB per file and 25 MiB total. Company logo/photo must be images. Nested folders are allowed only when basenames remain unique.'],
    ['Matching is case-sensitive. Duplicate basenames, including case-only variations, are rejected. Unreferenced ZIP files are reported and never uploaded.'],
    ['Keep masterCode and PIN as text. Export only the Registrations sheet as CSV; keep all headers. Never put local file paths in document fields.'],
    ['Legacy workbook-only image method: Insert > Pictures > This Device, anchored at the top-left of the correct document cell. One image per cell; keep inside that cell.'],
    ['Legacy workbook-only PDF/WEBP alternative: Attachments sheet contains full original bytes as base64 chunks (at most 30000 characters each). Use scripts/attach-import-document.cjs.'],
    ['Attachments columns: rowNumber (Registrations Excel row, starting 2), field (for example dl1), filename, part (starting 1), base64.'],
    ['Do not paste Explorer icons, OLE objects, previews, hyperlinks or paths. These are unsupported and rejected. Never use an image preview in place of a PDF.'],
    ['Document cells are blank for anchored images; attachment-sheet documents use the exact filename. PDF/JPEG/PNG/WEBP, 5 MiB each; company images only.'],
    ['masterCode is the original assigned text identifier (for example C01234). Preserve its prefix, case and leading zeros. Codes must be globally unique; supplied codes are never regenerated.'],
    ['For a NEW user only, leave masterCode blank to reserve a new ZI code during validation. Confirm using the identical workbook; the generated code is retained for retries.'],
    ['Company passwords: 8–256 characters with uppercase, lowercase and a number; matching confirmPassword.'],
    ['Customer/Patient credentials follow the existing secure first-login activation workflow.'],
    ['Field', 'Requirement / validation'],
    ...columns(kind).map(key => {
      const rules = metadata.filter(m => m.propertyName === key);
      const slot = key.replace(/File$/, '');
      const optional = rules.some(m => m.name === 'isOptional') || documentSlots[kind].optional.includes(slot);
      return [key, `${optional ? 'Optional' : 'Required'}${rules.map(m => m.constraints?.length ? `; ${m.name}: ${m.constraints.join(', ')}` : '').join('')}`];
    }),
  ]);
  const attachments = book.addWorksheet('Attachments');
  attachments.addRow(['rowNumber', 'field', 'filename', 'part', 'base64']);
  attachments.columns.forEach(column => { column.width = 24; column.numFmt = '@'; });
  instructions.getColumn(1).width = 45; instructions.getColumn(2).width = 100;
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function parseWorkbook(kind: RegistrationKind, file: Express.Multer.File) {
  return (await parseImportWorkbook(kind, file)).rows;
}
function extractAttachments(book: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, headers: string[], rows: Record<string, string>[]) {
  const files: Express.Multer.File[] = [];
  const occupied = new Set<string>();
  const add = (rowNumber: number, field: string, filename: string, bytes: Buffer) => {
    const column = headers.indexOf(`${field}File`);
    const key = `${rowNumber}:${field}`;
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > rows.length + 1 || column < 0 || occupied.has(key)) throw new BadRequestException('Broken or ambiguous workbook attachment row/field association');
    occupied.add(key); safeFilename(filename);
    if (!bytes.length || bytes.length > importLimits().documentBytes) throw new BadRequestException('Workbook document is empty or exceeds the configured document limit');
    const extension = filename.split('.').pop()!.toLowerCase();
    const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' } as Record<string, string>)[extension];
    if (!mime) throw new BadRequestException('Unsupported workbook attachment format');
    const reference = rows[rowNumber - 2][`${field}File`];
    if (reference && reference !== filename) throw new BadRequestException('Document cell does not match its embedded attachment filename');
    // Internal references include row and field; repeated original names never cross-associate rows.
    const internal = `row-${rowNumber}-${field}-${filename}`;
    rows[rowNumber - 2][`${field}File`] = internal;
    files.push({ originalname: internal, fieldname: field, mimetype: mime, buffer: bytes, size: bytes.length } as Express.Multer.File);
  };
  const referencedImages = new Set<number>();
  for (const image of sheet.getImages()) {
    referencedImages.add(Number(image.imageId));
    const range = image.range;
    const row = range.tl.nativeRow + 1, col = range.tl.nativeCol;
    const field = headers[col]?.endsWith('File') ? headers[col].slice(0, -4) : '';
    if (!field || range.tl.nativeRowOff !== 0 || range.tl.nativeColOff !== 0 || !range.br || range.br.row > row || range.br.col > col + 1) throw new BadRequestException('Image must be anchored at the top-left and contained in one registration document cell');
    const media = book.getImage(Number(image.imageId));
    if (!media?.buffer || media.filename || media.base64) throw new BadRequestException('Workbook image does not contain extractable original bytes');
    add(row, field, `image-${row}-${field}.${media.extension}`, Buffer.from(media.buffer));
  }
  if (referencedImages.size !== book.model.media.length) throw new BadRequestException('Unreferenced or unsupported workbook image object');
  const attachmentSheet = book.getWorksheet('Attachments');
  if (attachmentSheet) {
    if (attachmentSheet.rowCount > 3001 || attachmentSheet.columnCount !== 5 || attachmentSheet.model.merges?.length) throw new BadRequestException('Invalid Attachments sheet');
    if (JSON.stringify((attachmentSheet.getRow(1).values as ExcelJS.CellValue[]).slice(1)) !== JSON.stringify(['rowNumber', 'field', 'filename', 'part', 'base64'])) throw new BadRequestException('Invalid attachment headers');
    const groups = new Map<string, { row: number; field: string; filename: string; parts: string[] }>();
    for (let n = 2; n <= attachmentSheet.rowCount; n++) {
      const values = [1,2,3,4,5].map(c => attachmentSheet.getRow(n).getCell(c).value);
      if (values.some(v => v === null || !['string', 'number'].includes(typeof v))) throw new BadRequestException('Invalid attachment cell');
      const [rowText, field, filename, partText, chunk] = values.map(String);
      const row = Number(rowText), part = Number(partText), key = `${row}:${field}`;
      if (!Number.isInteger(part) || part < 1 || part > 250 || !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk) || chunk.length > 30000 || chunk.length % 4) throw new BadRequestException('Invalid base64 attachment chunk');
      const group = groups.get(key) ?? { row, field, filename, parts: [] };
      if (group.filename !== filename || part !== group.parts.length + 1) throw new BadRequestException('Missing, repeated or unordered attachment chunks');
      group.parts.push(chunk); groups.set(key, group);
    }
    for (const group of groups.values()) {
      const encoded = group.parts.join('');
      const bytes = Buffer.from(encoded, 'base64');
      if (bytes.toString('base64') !== encoded) throw new BadRequestException('Incomplete attachment bytes');
      add(group.row, group.field, group.filename, bytes);
    }
  }
  if (files.reduce((n, f) => n + f.size, 0) > importLimits().totalDocumentBytes) throw new BadRequestException('Workbook attachments exceed total document limit');
  return files;
}
