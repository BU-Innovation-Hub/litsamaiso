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
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch (_) {
    return String(v);
  }
};

export const defaultFilename = (base: string, format: string) => {
  const date = new Date().toISOString().split('T')[0];
  const safeBase = base.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  return `${safeBase || 'report'}_${date}.${format}`;
};
