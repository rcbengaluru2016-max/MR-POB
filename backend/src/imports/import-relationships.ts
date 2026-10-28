import { SaxesParser } from 'saxes';

/** Email auto-links are inert: only the displayed address is imported, never the link. */
export function mailtoAddress(target: string): string | undefined {
  if (!/^mailto:/i.test(target)) return;
  try {
    const address = decodeURIComponent(target.slice(7));
    if (address.length > 254 || !/^[^\s@,;?&#<>\x00-\x1f\x7f]+@[^\s@,;?&#<>\x00-\x1f\x7f]+$/.test(address)) return;
    return address;
  } catch { return; }
}

/** Parse decoded XML attributes so character references cannot disguise external targets. */
export function inspectRelationships(xml: string, part: string) {
  const parser = new SaxesParser({ xmlns: true });
  const namespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const hyperlink = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';
  const ids = new Set<string>();
  let depth = 0, root = false;
  const reject = () => { throw new Error('Unsafe or malformed XLSX relationship'); };
  parser.on('doctype', reject);
  parser.on('cdata', reject);
  parser.on('error', reject);
  parser.on('text', text => { if (text.trim()) reject(); });
  parser.on('opentag', tag => {
    depth++;
    if (tag.uri !== namespace) reject();
    if (depth === 1) { if (tag.local !== 'Relationships' || root) reject(); root = true; return; }
    if (depth !== 2 || tag.local !== 'Relationship') reject();
    const attributes: Record<string, string> = {};
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.uri === 'http://www.w3.org/2000/xmlns/') continue;
      if (attribute.uri || !['Id', 'Type', 'Target', 'TargetMode'].includes(attribute.local)) reject();
      attributes[attribute.local] = attribute.value;
    }
    const { Id: id, Type: type, Target: target, TargetMode: mode } = attributes;
    if (!id || !type || !target || ids.has(id) || /[\x00-\x1f\x7f]/.test(target)) reject();
    ids.add(id);
    if (mode === 'External') {
      if (!/^xl\/worksheets\/_rels\/sheet[0-9]+\.xml\.rels$/.test(part) || type !== hyperlink || !mailtoAddress(target)) reject();
    } else if ((mode !== undefined && mode !== 'Internal') || /^\s*[A-Za-z][A-Za-z0-9+.-]*:|^\/\//.test(target)) reject();
  });
  parser.on('closetag', () => { depth--; });
  parser.write(xml).close();
  if (!root || depth !== 0) reject();
}
