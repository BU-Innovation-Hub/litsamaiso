import exportJson from './exportJson';
import exportCsv from './exportCsv';
import exportXlsx from './exportXlsx';
import exportPdf from './exportPdf';

export const exportData = async ({ format, data, meta, filename, logoSrc }: { format: 'json' | 'csv' | 'xlsx' | 'pdf'; data: unknown; meta?: any; filename?: string; logoSrc?: string }) => {
  switch (format) {
    case 'json':
      return exportJson({ data, meta, filename });
    case 'csv':
      return exportCsv({ data, meta, filename });
    case 'xlsx':
      return exportXlsx({ data, meta, filename });
    case 'pdf':
      return exportPdf({ data, meta, filename, logoSrc });
    default:
      throw new Error('Unknown export format');
  }
};

export default exportData;
