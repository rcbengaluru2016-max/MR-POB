import { BadRequestException } from '@nestjs/common';
import { RegistrationKind } from '@prisma/client';
import { columns, safeFilename } from './import-schema';
import { importLimits } from './import-limits';
import { parseImportWorkbook } from './import-workbook';

function recordsFromCsv(bytes: Buffer) {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new BadRequestException('CSV must contain valid UTF-8 text'); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new BadRequestException('CSV contains binary or unsupported control characters');
  const records: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false, started = false;
  const addField = () => { row.push(field); field = ''; closed = false; if (row.length > 40) throw new BadRequestException('CSV exceeds the template column limit'); };
  const addRow = () => { addField(); records.push(row); row = []; started = false; if (records.length > 251) throw new BadRequestException('Use at most 250 registration records'); };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') { if (text[index + 1] === '"') { field += '"'; index++; } else { quoted = false; closed = true; } }
      else field += char;
    } else if (char === ',') { addField(); started = true; }
    else if (char === '\r' || char === '\n') { if (char === '\r' && text[index + 1] === '\n') index++; addRow(); }
    else if (char === '"') { if (field || closed) throw new BadRequestException('Malformed CSV quoting'); quoted = true; started = true; }
    else { if (closed) throw new BadRequestException('Unexpected text after a quoted CSV field'); field += char; started = true; }
    if (field.length > 4096) throw new BadRequestException('CSV cell exceeds processing limit');
  }
  if (quoted) throw new BadRequestException('Unterminated CSV quoted field');
  if (started || field || row.length || closed) addRow();
  return records;
}

export async function parseImportSpreadsheet(kind: RegistrationKind, file: Express.Multer.File) {
  safeFilename(file.originalname);
  if (/\.xlsx$/i.test(file.originalname)) return parseImportWorkbook(kind, file);
  if (!/\.csv$/i.test(file.originalname)) throw new BadRequestException('Only .xlsx or UTF-8 .csv registration files are accepted');
  if (!file.buffer.length || file.buffer.length > importLimits().workbookBytes) throw new BadRequestException('CSV is empty or exceeds the configured spreadsheet size limit');
  const [rawHeaders, ...data] = recordsFromCsv(file.buffer);
  const headers = rawHeaders?.map(header => header.replace(/\s*\*$/, '').trim()) ?? [];
  const expected = columns(kind);
  if (new Set(headers).size !== headers.length || expected.some(key => !headers.includes(key)) || headers.some(key => !expected.includes(key))) throw new BadRequestException('Missing, repeated or unexpected template columns');
  if (!data.length) throw new BadRequestException('CSV contains no registration records');
  const rows = data.map((values, index) => {
    if (values.length !== headers.length || !values.some(Boolean)) throw new BadRequestException(`CSV row ${index + 2} has an incorrect column count or is empty`);
    return Object.fromEntries(headers.map((header, col) => [header, values[col]]));
  });
  return { rows, files: [] as Express.Multer.File[] };
}
