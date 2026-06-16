import { normalizeToRows, defaultFilename } from './utils';

// Convert an image URL to a data URL (base64) for jsPDF
async function getImageDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Could not fetch logo for PDF header:', err);
    return null;
  }
}

// Branded PDF exporter using jsPDF + autotable with header/footer/pagination support.
export const exportPdf = async ({ data, meta, filename, logoSrc }: { data: unknown; meta?: any; filename?: string; logoSrc?: string }) => {
  const name = filename || defaultFilename(meta?.title || meta?.reportKey || 'report', 'pdf');
  try {
    const { columns, rows } = normalizeToRows(data);
    const head = columns;
    const body = rows.map((r) => head.map((c) => (r as any)[c] ?? ''));

    // dynamic import to keep bundle light
    const jsPDFModule = await import('jspdf');
    await import('jspdf-autotable');
    // @ts-ignore
    const jsPDF = (jsPDFModule && (jsPDFModule.jsPDF || jsPDFModule.default)) as any;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' }) as any;

    const pageWidth = doc.internal.pageSize.getWidth ? doc.internal.pageSize.getWidth() : doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.getHeight ? doc.internal.pageSize.getHeight() : doc.internal.pageSize.height;

    const title = meta?.title || meta?.reportKey || 'Report';
    const institution = meta?.scope?.institutionName;

    // prepare logo
    const logoUrl = logoSrc || meta?.logo;
    const logoDataUrl = await getImageDataUrl(logoUrl);

    const marginLeft = 40;
    const marginRight = 40;

    // Render table with header callback to draw page header for every page
    doc.autoTable({
      head: [head],
      body,
      startY: 80,
      margin: { left: marginLeft, right: marginRight, top: 60, bottom: 60 },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [245, 245, 245], textColor: 40, fontStyle: 'bold' },
      didDrawPage: function (data: any) {
        // Header: title + institution + logo
        doc.setFontSize(14);
        doc.setTextColor(40);
        doc.text(String(title), data.settings.margin.left, 36);
        if (institution) {
          doc.setFontSize(10);
          doc.text(String(institution), data.settings.margin.left, 52);
        }
        if (logoDataUrl) {
          try {
            // estimate size and draw
            const imgProps = (doc as any).getImageProperties ? (doc as any).getImageProperties(logoDataUrl) : null;
            const imgW = 60;
            const imgH = imgProps ? (imgProps.height / imgProps.width) * imgW : 24;
            const x = pageWidth - data.settings.margin.right - imgW;
            doc.addImage(logoDataUrl, 'PNG', x, 18, imgW, imgH);
          } catch (e) {
            // ignore image errors
          }
        }

        // separator line
        doc.setDrawColor(200);
        doc.setLineWidth(0.5);
        doc.line(data.settings.margin.left, 60, pageWidth - data.settings.margin.right, 60);
      }
    });

    // add footers (page numbers and timestamp)
    const pageCount = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : doc.internal.getNumberOfPages();
    const footerY = pageHeight - 30;
    const dateStr = new Date().toLocaleString();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(dateStr, marginLeft, footerY);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, footerY, { align: 'center' });
    }

    doc.save(name);
  } catch (err) {
    console.error('PDF export failed:', err);
    throw err;
  }
};

export default exportPdf;
