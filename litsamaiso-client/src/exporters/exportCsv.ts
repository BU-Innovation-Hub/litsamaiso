import * as XLSX from 'xlsx';
import { normalizeToRows, defaultFilename } from './utils';

export const exportCsv = async ({ data, meta, filename }: { data: unknown; meta?: any; filename?: string }) => {
  const { columns, rows } = normalizeToRows(data);
  // create worksheet
  const wsData = [columns, ...rows.map((r: any) => columns.map((c) => r[c] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const name = filename || defaultFilename(meta?.title || meta?.reportKey || 'report', 'csv');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export default exportCsv;
