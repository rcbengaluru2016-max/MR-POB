// Imported identifiers belong to the source system. Keep their case, prefix and
// leading zeros; do not apply the new-registration ZI numbering policy to them.
export function importedMasterCodeError(value: unknown): string | undefined {
  return typeof value !== 'string' || !value.length || value.length > 128
    || /[\s/\\\x00-\x1f\x7f]/u.test(value) || value === '.' || value === '..'
    ? 'Master Code must be the original text identifier (1–128 characters, without whitespace, controls or path separators)'
    : undefined;
}

// Only codes in the generated namespace affect its counter. Legacy prefixes
// must never be interpreted as numbers or consume the ZI approval sequence.
export function generatedMasterCodeSerial(value: string): bigint | undefined {
  return /^ZI[0-9]{4,18}$/.test(value) && !/^ZI0+$/.test(value) ? BigInt(value.slice(2)) : undefined;
}
