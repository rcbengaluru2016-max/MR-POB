import JSZip from 'jszip';
export async function documentZip(entries: Record<string, Buffer | string> = {}, options?: { symlink?: string }) {
  const zip = new JSZip();
  for (const [name, bytes] of Object.entries(entries)) zip.file(name, bytes, { unixPermissions: options?.symlink === name ? '120777' : '100644' });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' });
}
