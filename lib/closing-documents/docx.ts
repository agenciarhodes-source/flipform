import { readZip, writeZip } from '@/lib/docx/zip';
import { closingFieldFor, fillWordXml, isWordTextPart, placeholdersInText } from './rules';

/** Reads a Word file. Throws when it is not a .docx. */
function openDocx(bytes: Uint8Array) {
  const entries = readZip(bytes);
  if (!entries.some((entry) => entry.name === 'word/document.xml')) throw new Error('docx_invalid');
  return entries;
}

/** The names written between {{ }} in the model, and which of them the system knows. */
export function docxPlaceholders(bytes: Uint8Array) {
  const names = new Set<string>();
  for (const entry of openDocx(bytes)) {
    if (!isWordTextPart(entry.name)) continue;
    // Word may split a name across pieces of text: read the text without the XML tags.
    const text = Buffer.from(entry.data).toString('utf8').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
    for (const name of placeholdersInText(text)) names.add(name);
  }
  const all = [...names];
  return { known: all.filter((name) => closingFieldFor(name)), unknown: all.filter((name) => !closingFieldFor(name)) };
}

/**
 * Fills the model with the customer's data (keys as in CLOSING_FIELDS). A field without a value
 * stays as {{NAME}} and is listed in `missing`, so nothing goes out with a blank.
 */
export function fillDocx(bytes: Uint8Array, values: Record<string, string | null | undefined>) {
  const missing = new Set<string>();
  const entries = openDocx(bytes).map((entry) => {
    if (!isWordTextPart(entry.name)) return entry;
    const result = fillWordXml(Buffer.from(entry.data).toString('utf8'), (name) => {
      const field = closingFieldFor(name);
      const value = field ? values[field.key]?.trim() : '';
      return value ? value : null;
    });
    result.missing.forEach((name) => missing.add(name));
    return { name: entry.name, data: new Uint8Array(Buffer.from(result.xml, 'utf8')) };
  });
  return { bytes: writeZip(entries), missing: [...missing] };
}
