import 'reflect-metadata';
import { columns } from '../src/imports/import-schema';
import { parseImportSpreadsheet } from '../src/imports/import-spreadsheet';
import { parseDocumentZip } from '../src/imports/import-document-zip';
import { documentZip } from './fixtures/import-zip';
import { template } from '../src/imports/import-workbook';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const file = (buffer: Buffer, originalname: string) => ({ buffer, originalname, size: buffer.length } as Express.Multer.File);
const csv = (values: Record<string,string> = {}, count = 1) => Buffer.from([columns('patient').join(','), ...Array.from({ length: count }, () => columns('patient').map(key => `"${(values[key] ?? '').replaceAll('"','""')}"`).join(','))].join('\r\n'));

describe('Registration spreadsheet formats', () => {
  it('reads UTF-8 CSV, quoted commas, newlines and leading zeros as exact text', async () => {
    const result = await parseImportSpreadsheet('patient', file(Buffer.concat([Buffer.from('\ufeff'), csv({ masterCode:'ZI00001234', patientName:'Test, "Quoted" Name', address:'First line\nSecond line' })]), 'patient.csv'));
    expect(result.rows[0]).toMatchObject({ masterCode:'ZI00001234', patientName:'Test, "Quoted" Name', address:'First line\nSecond line' });
  });
  it('keeps the supplied Customer template column layout', async () => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await template('customer') as never);
    expect(columns('customer')).toHaveLength(25);
    expect(book.getWorksheet('Registrations')!.getRow(1).values).toEqual([undefined, ...columns('customer')]);
  });
  it('accepts exactly 250 CSV records and rejects 251', async () => {
    expect((await parseImportSpreadsheet('patient', file(csv({ masterCode:'ZI00001234' },250), 'patient.csv'))).rows).toHaveLength(250);
    await expect(parseImportSpreadsheet('patient', file(csv({ masterCode:'ZI00001234' },251), 'patient.csv'))).rejects.toThrow('250');
  });
  it.each(['patient.xls','patient.pdf','patient.zip'])('rejects unsupported spreadsheet extension %s', async name => {
    await expect(parseImportSpreadsheet('patient', file(csv(),name))).rejects.toThrow('.xlsx or');
  });
  it('rejects binary content disguised as CSV, invalid UTF-8 and malformed quoting', async () => {
    for (const bytes of [Buffer.from([0,1,2]),Buffer.from([0xff,0xfe,0xff]),Buffer.from('"unterminated')]) await expect(parseImportSpreadsheet('patient',file(bytes,'patient.csv'))).rejects.toThrow();
    await expect(parseImportSpreadsheet('patient',file(csv(),'patient.xlsx'))).rejects.toThrow();
  });
  it('rejects wrong category, duplicate headers and inconsistent columns', async () => {
    const bytes = csv({masterCode:'ZI00001234'});
    await expect(parseImportSpreadsheet('company',file(bytes,'patient.csv'))).rejects.toThrow('columns');
    await expect(parseImportSpreadsheet('patient',file(Buffer.from(bytes.toString().replace('patientName','masterCode')),'patient.csv'))).rejects.toThrow('columns');
    await expect(parseImportSpreadsheet('patient',file(Buffer.from(columns('patient').join(',')+'\nZI00001234'),'patient.csv'))).rejects.toThrow('column count');
  });
});

describe('Supporting document ZIP safety', () => {
  it('extracts complete bytes using exact basenames even when ZIP order and folders differ', async () => {
    const expected = Buffer.from('original document bytes');
    const files = await parseDocumentZip(file(await documentZip({ 'outer/B.png':'image', 'outer/A.pdf':expected }), 'documents.zip'));
    expect(files.map(file=>file.originalname)).toEqual(['B.png','A.pdf']);
    expect(files.find(file=>file.originalname==='A.pdf')!.buffer.equals(expected)).toBe(true);
    expect(files.find(file=>file.originalname==='A.pdf')!.mimetype).toBe('application/pdf');
  });
  it('accepts an empty ZIP for a category without required documents', async () => {
    expect(await parseDocumentZip(file(await documentZip(),'empty.zip'))).toEqual([]);
  });
  it.each(['../escape.pdf','folder/../../escape.pdf','C:/escape.pdf','/escape.pdf','folder\\escape.pdf'])('rejects unsafe archive path %s', async path => {
    await expect(parseDocumentZip(file(await documentZip({ [path]:'data' }), 'documents.zip'))).rejects.toThrow();
  });
  it('rejects symlink entries', async () => {
    await expect(parseDocumentZip(file(await documentZip({ 'link.pdf':'target' },{symlink:'link.pdf'}),'documents.zip'))).rejects.toThrow('Unsafe');
  });
  it('rejects duplicate or case-ambiguous basenames in separate folders', async () => {
    for (const other of ['proof.pdf','PROOF.pdf']) await expect(parseDocumentZip(file(await documentZip({'a/proof.pdf':'first',[`b/${other}`]:'second'}),'documents.zip'))).rejects.toThrow('ambiguous');
  });
  it('rejects corrupted bytes using the ZIP checksum', async () => {
    const zip = new JSZip(); zip.file('proof.pdf','plain original bytes');
    const bytes = await zip.generateAsync({ type:'nodebuffer',compression:'STORE' });
    const offset = bytes.indexOf(Buffer.from('plain original bytes')); bytes[offset] ^= 1;
    await expect(parseDocumentZip(file(bytes,'documents.zip'))).rejects.toThrow('checksum');
  });
  it('rejects archive expansion over the configured quota', async () => {
    const previous = process.env.IMPORT_DOCUMENT_TOTAL_BYTES; process.env.IMPORT_DOCUMENT_TOTAL_BYTES='10';
    try { await expect(parseDocumentZip(file(await documentZip({'first.pdf':Buffer.alloc(6),'second.pdf':Buffer.alloc(6)}),'documents.zip'))).rejects.toThrow('expanded-byte'); }
    finally { if(previous===undefined) delete process.env.IMPORT_DOCUMENT_TOTAL_BYTES; else process.env.IMPORT_DOCUMENT_TOTAL_BYTES=previous; }
  });
  it('checks actual ZIP content and the archive extension', async () => {
    await expect(parseDocumentZip(file(Buffer.from('not zip'),'documents.zip'))).rejects.toThrow('valid .zip');
    await expect(parseDocumentZip(file(await documentZip(),'documents.rar'))).rejects.toThrow('valid .zip');
  });
});
