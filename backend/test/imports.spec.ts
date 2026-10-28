import 'reflect-metadata';
import ExcelJS from 'exceljs';
import { generatedMasterCodeSerial } from '../src/common/master-code';
import { columns, safeFields, safeFilename, validateInput, masterCodeError } from '../src/imports/import-schema';
import { inspectArchive, parseWorkbook, parseImportWorkbook, template } from '../src/imports/import-workbook';
import { companyInput, customerInput, patientInput } from './fixtures/registration-inputs';
import { AdminGuard } from '../src/auth/auth.guard';
import { ExecutionContext } from '@nestjs/common';

const file = (buffer: Buffer, originalname = 'registrations.xlsx') => ({ buffer, originalname, size: buffer.length } as Express.Multer.File);
async function workbook(count: number, transform?: (sheet: ExcelJS.Worksheet) => void) {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await template('patient') as unknown as Parameters<typeof book.xlsx.load>[0]);
  const sheet = book.getWorksheet('Registrations')!;
  const data = { ...patientInput(), password: undefined, confirmPassword: undefined } as Record<string, unknown>;
  for (let i = 0; i < count; i++) sheet.addRow(columns('patient').map(key => key === 'mobile' ? String(9000000000 + i) : data[key] ?? ''));
  transform?.(sheet);
  return file(Buffer.from(await book.xlsx.writeBuffer()));
}

describe('Administrative import security and workbook validation', () => {
  test.each(['ADMIN', 'SUPER_ADMIN'])('%s can import', role => {
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { role, state: 'ACTIVE' } }) }) } as ExecutionContext;
    expect(new AdminGuard().canActivate(context)).toBe(true);
  });
  test.each(['CUSTOMER', 'COMPANY', 'PATIENT', 'MEDICAL_REPRESENTATIVE', undefined])('%s cannot import', role => {
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { role, state: 'ACTIVE' } }) }) } as ExecutionContext;
    expect(() => new AdminGuard().canActivate(context)).toThrow('Administrator access required');
  });
  test.each(['customer', 'company', 'patient'] as const)('%s template uses current DTO fields and exact file slots', async kind => {
    const bytes = await template(kind);
    await expect(inspectArchive(bytes)).resolves.toBeUndefined();
    const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
    expect(book.getWorksheet('Registrations')!.getRow(1).values).toEqual([undefined, ...columns(kind)]);
    expect(book.getWorksheet('Instructions')!.rowCount).toBeGreaterThan(5);
    expect(columns(kind).includes('password')).toBe(kind === 'company');
  });
  it('accepts exactly 250 rows', async () => { expect(await parseWorkbook('patient', await workbook(250))).toHaveLength(250); });
  it('rejects 251 rows', async () => { await expect(parseWorkbook('patient', await workbook(251))).rejects.toThrow('250'); });
  it('rejects missing columns', async () => { await expect(parseWorkbook('patient', await workbook(1, sheet => { sheet.getRow(1).getCell(1).value = 'unexpected'; }))).rejects.toThrow('columns'); });
  it('rejects formulas even with cached results', async () => { await expect(parseWorkbook('patient', await workbook(1, sheet => { sheet.getRow(2).getCell(1).value = { formula: '1+1', result: 2 }; }))).rejects.toThrow('Unsafe'); });
  it('rejects external hyperlinks', async () => { await expect(parseWorkbook('patient', await workbook(1, sheet => { sheet.getRow(2).getCell(1).value = { text: 'Click', hyperlink: 'https://example.test' }; }))).rejects.toThrow('Unsafe'); });
  it('rejects merged cells', async () => { await expect(parseWorkbook('patient', await workbook(1, sheet => sheet.mergeCells('A2:B2')))).rejects.toThrow('template'); });
  it('rejects hidden sheets', async () => { await expect(parseWorkbook('patient', await workbook(1, sheet => { sheet.state = 'hidden'; }))).rejects.toThrow('template'); });
  it('rejects malformed files, wrong extension and oversized archives', async () => {
    await expect(parseWorkbook('patient', file(Buffer.from('not a ZIP')))).rejects.toThrow();
    await expect(parseWorkbook('patient', file(Buffer.from('data'), 'data.xlsm'))).rejects.toThrow('.xlsx');
    await expect(inspectArchive(Buffer.alloc(40 * 1024 * 1024 + 1))).rejects.toThrow('40 MiB');
  });
  it('reuses company complexity and confirmation rules without returning values', async () => {
    const result = await validateInput('company', companyInput({ password: 'secret', confirmPassword: 'different' }) as unknown as Record<string, unknown>);
    expect(result.errors).toContain('Invalid or missing password');
    expect(result.errors).toContain('Invalid or missing confirmPassword');
    expect(JSON.stringify(result.errors)).not.toContain('secret');
    expect(safeFields(result.input)).not.toHaveProperty('password');
    expect(safeFields(result.input)).not.toHaveProperty('confirmPassword');
  });
  it('reuses category field and optional password rules', async () => {
    const { password: _p, confirmPassword: _c, ...patient } = patientInput();
    expect((await validateInput('patient', patient)).errors).toEqual([]);
    expect((await validateInput('customer', customerInput({ mobile: '123', creditDays: 'invalid' }) as unknown as Record<string, unknown>)).errors).toEqual(expect.arrayContaining(['Invalid or missing mobile', 'Invalid or missing creditDays']));
  });
  test.each(['../file.pdf', 'C:\\document.pdf', '/file.pdf', 'file\u0000.pdf', 'file.pdf '])('rejects unsafe filename %s', name => { expect(() => safeFilename(name)).toThrow(); });
});

describe('Workbook-only attachments and existing Master Codes', () => {
  it('preserves legacy text codes and rejects unsafe or coerced identifiers', () => {
    for (const value of [undefined, '', 1234, ' C01234', 'C01234 ', '../C01234', 'C/01234', 'C\\01234', 'C\u000001', 'A'.repeat(129)]) expect(masterCodeError(value)).toBeDefined();
    for (const value of ['C01234', 'cust-0001', 'Company_009', 'zi0001', '000012', 'ZI000012']) expect(masterCodeError(value)).toBeUndefined();
  });
  it('only advances the generator for supplied codes in its ZI namespace', () => {
    expect(generatedMasterCodeSerial('ZI000012')).toBe(12n);
    for (const code of ['C01234', 'cust-0001', 'zi0001', '000012', 'ZI0000', 'ZI' + '9'.repeat(100)]) expect(generatedMasterCodeSerial(code)).toBeUndefined();
  });
  it('includes a text Master Code column in every category', async () => {
    for (const kind of ['customer','company','patient'] as const) {
      const book = new ExcelJS.Workbook(); await book.xlsx.load(await template(kind) as never);
      expect(book.getWorksheet('Registrations')!.getCell('A1').value).toBe('masterCode');
      expect(book.getWorksheet('Registrations')!.getColumn(1).numFmt).toBe('@');
    }
  });
  it('extracts exact complete PDF bytes from the controlled attachment sheet', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = Buffer.from(await pdf.save());
    const book = new ExcelJS.Workbook(); await book.xlsx.load((await workbook(1)).buffer as never);
    const sheet = book.getWorksheet('Registrations')!;
    const c = columns('patient').indexOf('idProofFile') + 1;
    sheet.getRow(2).getCell(c).value = 'proof.pdf';
    book.getWorksheet('Attachments')!.addRow(['2','idProof','proof.pdf','1',bytes.toString('base64')]);
    const result = await parseImportWorkbook('patient', file(Buffer.from(await book.xlsx.writeBuffer())));
    expect(result.files[0].buffer.equals(bytes)).toBe(true);
    expect(result.rows[0].idProofFile).toBe(result.files[0].originalname);
  });
  it('extracts a genuine image at the correct row and document column', async () => {
    const sharp = (await import('sharp')).default;
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
    const book = new ExcelJS.Workbook(); await book.xlsx.load((await workbook(2)).buffer as never);
    const col = columns('patient').indexOf('idProofFile');
    const id = book.addImage({ buffer: bytes as never, extension: 'png' });
    const letter = book.getWorksheet('Registrations')!.getColumn(col + 1).letter;
    book.getWorksheet('Registrations')!.addImage(id, `${letter}3:${letter}3`);
    const result = await parseImportWorkbook('patient', file(Buffer.from(await book.xlsx.writeBuffer())));
    expect(result.files[0].buffer.equals(bytes)).toBe(true);
    expect(result.rows[0].idProofFile).toBe('');
    expect(result.rows[1].idProofFile).toBe(result.files[0].originalname);
  });
  it('rejects an attachment associated with an absent registration row', async () => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load((await workbook(1)).buffer as never);
    book.getWorksheet('Attachments')!.addRow(['3','idProof','proof.pdf','1',Buffer.from('data').toString('base64')]);
    await expect(parseImportWorkbook('patient', file(Buffer.from(await book.xlsx.writeBuffer())))).rejects.toThrow('association');
  });
  it('rejects missing, repeated and reordered chunks', async () => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load((await workbook(1)).buffer as never);
    book.getWorksheet('Attachments')!.addRow(['2','idProof','proof.pdf','2',Buffer.from('data').toString('base64')]);
    await expect(parseImportWorkbook('patient', file(Buffer.from(await book.xlsx.writeBuffer())))).rejects.toThrow('chunks');
  });
});

describe('Imported PDF security', () => {
  it('rejects parsed PDF active actions and embedded-file objects', async () => {
    const { PDFDocument, PDFName, PDFString } = await import('pdf-lib');
    const { checkImportDocumentSafety } = await import('../src/imports/import-document-security');
    for (const name of ['OpenAction', 'EmbeddedFiles']) {
      const pdf = await PDFDocument.create(); pdf.addPage();
      pdf.catalog.set(PDFName.of(name), pdf.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('unsafe payload') }));
      const bytes = Buffer.from(await pdf.save({ useObjectStreams: true }));
      await expect(checkImportDocumentSafety([file(bytes, 'test.pdf')])).rejects.toThrow('active content');
    }
  });
  it('accepts an ordinary PDF without changing its bytes', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { checkImportDocumentSafety } = await import('../src/imports/import-document-security');
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = Buffer.from(await pdf.save());
    const before = Buffer.from(bytes);
    await expect(checkImportDocumentSafety([file(bytes, 'test.pdf')])).resolves.toBeUndefined();
    expect(bytes.equals(before)).toBe(true);
  });
});

describe('Excel desktop email auto-link compatibility', () => {
  it.each(['customer','company','patient'] as const)('imports %s email auto-links as plain displayed email text', async kind => {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await template(kind) as never);
    const fields = { masterCode:'ZI001234', ...(kind==='customer'?customerInput():kind==='company'?companyInput():patientInput()) } as Record<string,unknown>;
    const sheet=book.getWorksheet('Registrations')!;
    sheet.addRow(columns(kind).map(key=>fields[key]??''));
    const column=kind==='company'?'adminEmail':'email';
    sheet.getRow(2).getCell(columns(kind).indexOf(column)+1).value={text:'person@example.test',hyperlink:'mailto:person@example.test'};
    const result=await parseImportWorkbook(kind,file(Buffer.from(await book.xlsx.writeBuffer())));
    expect(result.rows[0][column]).toBe('person@example.test');
    expect(JSON.stringify(result.rows)).not.toContain('mailto:');
  });
  it('rejects a mailto target that differs from the displayed email', async () => {
    await expect(parseWorkbook('patient',await workbook(1,sheet=>{sheet.getRow(2).getCell(columns('patient').indexOf('email')+1).value={text:'person@example.test',hyperlink:'mailto:other@example.test'};}))).rejects.toThrow('matching email');
  });
  it('rejects email auto-links in non-email columns', async () => {
    await expect(parseWorkbook('patient',await workbook(1,sheet=>{sheet.getRow(2).getCell(columns('patient').indexOf('patientName')+1).value={text:'person@example.test',hyperlink:'mailto:person@example.test'};}))).rejects.toThrow('email columns');
  });
  it.each(['mailto:person@example.test?bcc=other@example.test','mailto:person@example.test%0d%0aBcc:other@example.test','file:///C:/private.pdf'])('rejects unsafe hyperlink targets without following them',async target=>{
    await expect(parseWorkbook('patient',await workbook(1,sheet=>{sheet.getRow(2).getCell(columns('patient').indexOf('email')+1).value={text:'person@example.test',hyperlink:target};}))).rejects.toThrow('Unsafe');
  });
});

describe('Decoded XLSX relationship security',()=>{
  const xml=(target:string,mode='External',type='hyperlink')=>`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}" TargetMode="${mode}"/></Relationships>`;
  const part='xl/worksheets/_rels/sheet1.xml.rels';
  it('accepts XML-encoded mailto auto-links and blocks encoded external web links',async()=>{
    const {inspectRelationships}=await import('../src/imports/import-relationships');
    expect(()=>inspectRelationships(xml('mailto:person@example.test','&#69;xternal'),part)).not.toThrow();
    expect(()=>inspectRelationships(xml('&#104;ttps://example.test','&#69;xternal'),part)).toThrow('Unsafe');
    expect(()=>inspectRelationships(xml('https://example.test','Internal'),part)).toThrow('Unsafe');
  });
  it('rejects mailto targets used as external workbook/OLE relationships',async()=>{
    const {inspectRelationships}=await import('../src/imports/import-relationships');
    expect(()=>inspectRelationships(xml('mailto:person@example.test','External','externalLinkPath'),part)).toThrow('Unsafe');
    expect(()=>inspectRelationships(xml('mailto:person@example.test'),'xl/_rels/workbook.xml.rels')).toThrow('Unsafe');
  });
});
