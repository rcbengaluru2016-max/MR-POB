import assert from 'node:assert/strict';
import test from 'node:test';
import { validateImportFiles } from '../lib/import-files.ts';
const archive = () => new File([Uint8Array.from([0x50,0x4b,0x05,0x06])], 'documents.zip');
test('browser accepts XLSX/CSV with ZIP and rejects wrong extensions or content', async () => {
  await validateImportFiles(new File([Uint8Array.from([0x50,0x4b,0x03,0x04])], 'data.xlsx'),archive());
  await validateImportFiles(new File(['masterCode,patientName\nZI0001,Test'], 'data.csv'),archive());
  await assert.rejects(()=>validateImportFiles(new File(['data'], 'data.xls'),archive()), /xlsx or/);
  await assert.rejects(()=>validateImportFiles(new File(['data'], 'data.xlsx'),archive()), /Excel workbook/);
  await assert.rejects(()=>validateImportFiles(new File(['data'], 'data.csv'),new File(['data'],'documents.zip')), /ZIP archive/);
  await assert.rejects(()=>validateImportFiles(new File(['data'], 'data.csv'),new File(['data'],'documents.pdf')), /zip file/);
  await assert.rejects(()=>validateImportFiles(new File([Uint8Array.from([0,1,2])], 'data.csv'),archive()), /binary data/);
});
