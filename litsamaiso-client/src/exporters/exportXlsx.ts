import * as XLSX from 'xlsx';
import { normalizeToRows, defaultFilename } from './utils';

export const exportXlsx = async ({ data, meta, filename }: { data: unknown; meta?: any; filename?: string }) => {
  const { columns, rows } = normalizeToRows(data);
  const wsData = [columns, ...rows.map((r: any) => columns.map((c) => r[c] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const name = filename || defaultFilename(meta?.title || meta?.reportKey || 'report', 'xlsx');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export default exportXlsx;
