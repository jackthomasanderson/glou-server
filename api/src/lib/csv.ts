/**
 * Minimal, dependency-free CSV parser (RFC 4180-ish):
 * - comma-separated, double-quote enclosure
 * - escaped quotes via a doubled `""` inside a quoted field
 * - handles both CRLF and LF line endings, including newlines inside a
 *   quoted field
 *
 * Hand-written on purpose (FEAT-56 scope: CSV import only) instead of
 * pulling a third-party dependency — see the implementation workflow's
 * "verify npm view <package> types before use" rule, added after the
 * ua-parser-js types regression. A correct-enough parser for well-formed
 * spreadsheet exports is a small amount of code, so no dependency is
 * justified here.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const records: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    // Skip fully empty trailing lines (e.g. a lone blank line before EOF)
    if (cells.length === 1 && cells[0].trim() === '') continue;

    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = (cells[idx] ?? '').trim();
    });
    records.push(record);
  }

  return records;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Normalize line endings up front; the parser itself still works
  // char-by-char so a newline inside a quoted field is preserved as data.
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  // Flush the last field/row when the file doesn't end with a newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
