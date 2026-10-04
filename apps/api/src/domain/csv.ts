/**
 * A small CSV reader (RFC 4180): fields separated by commas, rows by CRLF or LF, and any
 * field may be wrapped in double quotes to hold commas, line breaks or "" (a literal quote).
 * Excel's byte-order mark is dropped. Pure, so the import rules can be tested without files.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.startsWith('﻿') ? text.slice(1) : text;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** "First name", "first_name" and "FirstName" all mean the same column. */
export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z]/g, '');
}

/** yes/no, true/false, y/n, 1/0 - empty means no. Anything else is not understood (null). */
export function parseYesNo(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  if (['', 'no', 'n', 'false', '0'].includes(text)) return false;
  if (['yes', 'y', 'true', '1'].includes(text)) return true;
  return null;
}

/** "Peanuts; Gluten" -> ["Peanuts", "Gluten"] (semicolons or pipes, so commas stay free). */
export function splitList(value: string): string[] {
  return value
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
