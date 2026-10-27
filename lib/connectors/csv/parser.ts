/** CSV v1: explicit delimiter, UTF-8 with optional BOM, RFC-style double quotes. */
export const CSV_LIMITS = {
  fileBytes: 256 * 1024,
  totalBytes: 1024 * 1024,
  rows: 500,
  fields: 48,
  fieldChars: 4096,
} as const;
export type CsvDelimiter = "," | ";" | "\t";
export class CsvError extends Error {
  constructor(
    public code: string,
    public row = 0,
    public field?: string,
  ) {
    super(code);
  }
}
export interface CsvRow {
  row: number;
  cells: Record<string, string>;
}
export function parseCsv(bytes: Uint8Array, delimiter: CsvDelimiter) {
  if (![",", ";", "\t"].includes(delimiter))
    throw new CsvError("INVALID_DELIMITER");
  if (bytes.byteLength > CSV_LIMITS.fileBytes)
    throw new CsvError("FILE_TOO_LARGE");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CsvError("INVALID_UTF8");
  }
  if (text.includes("\0")) throw new CsvError("INVALID_CHARACTER");
  const records: Array<{ row: number; values: string[] }> = [];
  let values: string[] = [],
    field = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const pushField = () => {
    if (field.length > CSV_LIMITS.fieldChars)
      throw new CsvError("FIELD_TOO_LONG", start);
    values.push(field);
    field = "";
    closed = false;
    if (values.length > CSV_LIMITS.fields)
      throw new CsvError("TOO_MANY_COLUMNS", start);
  };
  const pushRow = () => {
    pushField();
    records.push({ row: start, values });
    values = [];
    if (records.length > CSV_LIMITS.rows + 1)
      throw new CsvError("TOO_MANY_ROWS", start);
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        field += ch;
        if (ch === "\n") line++;
      }
    } else if (ch === delimiter) pushField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] !== "\n")
        throw new CsvError("INVALID_NEWLINE", line);
      if (ch === "\r") i++;
      pushRow();
      line++;
      start = line;
    } else if (ch === '"' && !field && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw new CsvError("INVALID_QUOTING", line);
      field += ch;
    }
    if (field.length > CSV_LIMITS.fieldChars)
      throw new CsvError("FIELD_TOO_LONG", start);
  }
  if (quoted) throw new CsvError("TRUNCATED_QUOTE", start);
  if (field || values.length || closed) pushRow();
  const header = records.shift();
  if (
    !header ||
    header.values.some((h) => !h || h !== h.trim() || h.length > 200) ||
    new Set(header.values).size !== header.values.length
  )
    throw new CsvError("INVALID_HEADERS", 1);
  const headers = header.values;
  const rows = records.map(({ row, values }) => {
    if (values.length !== headers.length)
      throw new CsvError("COLUMN_COUNT", row);
    return {
      row,
      cells: Object.fromEntries(headers.map((h, i) => [h, values[i]])),
    };
  });
  return { headers, rows };
}
