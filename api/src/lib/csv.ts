/**
 * Minimal, dependency-free CSV parser (RFC 4180-ish):
 * - comma- or semicolon-separated (the delimiter is detected from the header
 *   line, since Excel on a French/European locale exports `;` by default)
 * - double-quote enclosure
 * - escaped quotes via a doubled `""` inside a quoted field
 * - handles both CRLF and LF line endings, including newlines inside a
 *   quoted field
 * - tolerates a leading UTF-8 BOM, which Excel also writes
 *
 * Hand-written on purpose (FEAT-56 scope: CSV import only) instead of
 * pulling a third-party dependency — see the implementation workflow's
 * "verify npm view <package> types before use" rule, added after the
 * ua-parser-js types regression. A correct-enough parser for well-formed
 * spreadsheet exports is a small amount of code, so no dependency is
 * justified here.
 */
// Defensive upper bound on the raw input length. The HTTP upload path already
// caps the file at 2 MB (`csvUpload` in upload.middleware.ts); this guards the
// char-by-char parser below — whose main loop runs once per input character —
// against ever being handed an unbounded string by some future caller that
// forgets to. ~5M chars comfortably clears any legitimate onboarding export.
const MAX_CSV_CHARS = 5_000_000;

/** Delimiters we know how to auto-detect, in tie-break order. */
const SUPPORTED_DELIMITERS = [',', ';'] as const;

export function parseCsv(text: string): Record<string, string>[] {
  if (text.length > MAX_CSV_CHARS) {
    throw new Error('CSV_TOO_LARGE');
  }
  const rows = parseCsvRows(stripBom(text));
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

/**
 * Removes the UTF-8 byte order mark Excel prepends to its CSV exports. Left
 * in place it would become part of the first header name (U+FEFF followed by
 * "name"), so the `name` column would never be recognized.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Picks the field delimiter by counting unquoted candidates on the header
 * line only — the header is the one line guaranteed to be free of embedded
 * newlines in practice, and its separator count is the most reliable signal.
 * Ties (including a single-column file, where every count is 0) resolve to
 * the comma, preserving the pre-existing behaviour.
 */
function detectDelimiter(normalized: string): string {
  const counts: Record<string, number> = {};
  for (const candidate of SUPPORTED_DELIMITERS) counts[candidate] = 0;
  let inQuotes = false;

  const len = Math.min(normalized.length, MAX_CSV_CHARS);
  for (let i = 0; i < len; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === '\n') break;
    else if (counts[char] !== undefined) counts[char] += 1;
  }

  let best: string = SUPPORTED_DELIMITERS[0];
  for (const candidate of SUPPORTED_DELIMITERS) {
    if (counts[candidate] > counts[best]) best = candidate;
  }
  return best;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Normalize line endings up front; the parser itself still works
  // char-by-char so a newline inside a quoted field is preserved as data.
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = detectDelimiter(normalized);

  // Hard clamp on the iteration count — `parseCsv` already rejects anything
  // over MAX_CSV_CHARS, this keeps the loop bound provably constant-bounded
  // even if the function is ever called from elsewhere.
  const len = Math.min(normalized.length, MAX_CSV_CHARS);
  for (let i = 0; i < len; i++) {
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
    } else if (char === delimiter) {
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
