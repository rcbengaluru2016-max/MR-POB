const ExcelJS = require('exceljs');
const { readFile, writeFile } = require('node:fs/promises');
const { basename, resolve } = require('node:path');
// Usage: node scripts/attach-import-document.cjs input.xlsx 2 dl1 document.pdf output.xlsx
(async () => {
  const [input, rowText, field, source, output] = process.argv.slice(2);
  const row = Number(rowText);
  if (!input || !output || resolve(input) === resolve(output) || !Number.isInteger(row) || row < 2 || row > 251 || !/^[A-Za-z][A-Za-z0-9]*$/.test(field ?? '') || !source) throw new Error('Usage: input.xlsx rowNumber documentField originalFile output.xlsx (use a different output path)');
  const bytes = await readFile(source);
  if (!bytes.length || bytes.length > 5 * 1024 * 1024 || !/\.(pdf|png|jpe?g|webp)$/i.test(source)) throw new Error('Use PDF, PNG, JPG or WEBP, at most 5 MiB');
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(input);
  const sheet = book.getWorksheet('Registrations'), attachments = book.getWorksheet('Attachments');
  if (!sheet || !attachments || row > sheet.rowCount) throw new Error('Complete the current template registration row first');
  const headers = sheet.getRow(1).values;
  const col = headers.indexOf(`${field}File`);
  if (col < 1) throw new Error('Document field does not belong to this template');
  for (let n = 2; n <= attachments.rowCount; n++) if (Number(attachments.getRow(n).getCell(1).value) === row && attachments.getRow(n).getCell(2).value === field) throw new Error('Attachment already exists for this row and field');
  if (sheet.getRow(row).getCell(col).value) throw new Error('Document cell must be empty before attaching');
  const encoded = bytes.toString('base64'), filename = basename(source);
  for (let offset = 0, part = 1; offset < encoded.length; offset += 30000, part++) attachments.addRow([String(row), field, filename, String(part), encoded.slice(offset, offset + 30000)]);
  sheet.getRow(row).getCell(col).value = filename;
  await writeFile(output, Buffer.from(await book.xlsx.writeBuffer()), { flag: 'wx' });
  console.log(`Attached ${filename} to row ${row}, ${field}. Original bytes preserved; backend content validation still applies.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
