import { normalizeToRows, defaultFilename } from './utils';

// Fallback PDF exporter using jsPDF + autotable to avoid @react-pdf/renderer peer issues.
export const exportPdf = async ({ data, meta, filename, logoSrc }: { data: unknown; meta?: any; filename?: string; logoSrc?: string }) => {
  void logoSrc;
  const name = filename || defaultFilename(meta?.title || meta?.reportKey || 'report', 'pdf');
  try {
    const { columns, rows } = normalizeToRows(data);
    const head = columns;
    const body = rows.map((r) => head.map((c) => (r as any)[c] ?? ''));

    // dynamic import to keep bundle small and avoid build-time peer issues
    const jsPDFModule = await import('jspdf');
    await import('jspdf-autotable');
    // jsPDF default export may be under default
    // @ts-ignore
    const jsPDF = (jsPDFModule && (jsPDFModule.jsPDF || jsPDFModule.default)) as any;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    // add title
    const title = meta?.title || meta?.reportKey || 'Report';
    doc.setFontSize(14);
    doc.text(String(title), 40, 40);

    // add table
    // @ts-ignore
    doc.autoTable({ head: [head], body, startY: 60, styles: { fontSize: 9 } });

    // save
    doc.save(name);
  } catch (err) {
    console.error('PDF export failed:', err);
    throw err;
  }
};

export default exportPdf;
