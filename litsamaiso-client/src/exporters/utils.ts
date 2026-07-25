import * as XLSX from 'xlsx';

export type AnyObject = Record<string, any>;

export const isArrayOfObjects = (data: unknown): data is AnyObject[] => {
  return Array.isArray(data) && data.every((d) => d && typeof d === 'object' && !Array.isArray(d));
};

export const normalizeToRows = (data: unknown): { columns: string[]; rows: AnyObject[] } => {
  if (data === undefined || data === null) return { columns: [], rows: [] };

  if (isArrayOfObjects(data)) {
    // collect union of keys
    const colsSet = new Set<string>();
    for (const row of data) {
      Object.keys(row).forEach((k) => colsSet.add(k));
    }
    const columns = Array.from(colsSet);
    const rows = data.map((r) => flattenRow(r, columns));
    return { columns, rows };
  }

  if (typeof data === 'object') {
    const obj = data as AnyObject;
    const columns = ['key', 'value'];
    const rows = Object.keys(obj || {}).map((k) => ({ key: k, value: flattenValue((obj as AnyObject)[k]) }));
    return { columns, rows };
  }

  // primitive
  return { columns: ['value'], rows: [{ value: String(data) }] };
};

export const flattenRow = (row: AnyObject, columns?: string[]) => {
  const cols = columns || Object.keys(row);
  const out: AnyObject = {};
  for (const c of cols) {
    out[c] = flattenValue(row[c]);
  }
  return out;
};

export const flattenValue = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().split('T')[0];
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
};

const TEXT_COLUMN_PATTERNS = [
  /^borrower/i,
  /^account\s*(?:number|no|#|num)/i,
  /^branch\s*code/i,
  /^student\s*id/i,
  /^batch\s*number/i,
];

export const forceTextColumns = (ws: XLSX.WorkSheet): void => {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);

  const colIndices: number[] = [];
  if (range.s.r === 0) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      const cell = ws[addr];
      if (cell && cell.v) {
        const headerName = String(cell.v);
        if (TEXT_COLUMN_PATTERNS.some((p) => p.test(headerName))) {
          colIndices.push(C);
        }
      }
    }
  }

  if (colIndices.length === 0) return;

  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    for (const C of colIndices) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell) {
        cell.t = "s";
        cell.v = String(cell.v ?? "");
        cell.z = "@";
      }
    }
  }
};

export const defaultFilename = (base: string, format: string) => {
  const date = new Date().toISOString().split('T')[0];
  const safeBase = base.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  return `${safeBase || 'report'}_${date}.${format}`;
};
