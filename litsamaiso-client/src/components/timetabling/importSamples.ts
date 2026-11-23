import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../../utils/apiError';
import { timetablingService, type ImportColumns, type SampleKind } from '../../services/timetablingService';
import { saveBlob } from '../../utils/saveBlob';

// Sample CSVs for the Rooms, Lecturers and Modules tabs, and the column guide beside them. The columns come
// from the API, which reads the same list the import does, so the guide can't fall out of step with uploads.

export const SAMPLE_KINDS: SampleKind[] = ['rooms', 'lecturers', 'modules'];
export const SAMPLE_LABELS: Record<SampleKind, string> = { rooms: 'Rooms', lecturers: 'Lecturers', modules: 'Modules' };

// Loaded once per visit and shared by every card. A failed load is forgotten, so the next hover tries again.
let columnsRequest: Promise<ImportColumns> | null = null;
export const loadImportColumns = () => {
  columnsRequest ??= timetablingService.getImportColumns().catch((error: unknown) => {
    columnsRequest = null;
    throw error;
  });
  return columnsRequest;
};

// The column guide, loaded when `load` is first called (on hover)
export const useImportColumns = () => {
  const [columns, setColumns] = useState<ImportColumns | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    if (columns) return;
    setFailed(false);
    loadImportColumns().then(setColumns, () => setFailed(true));
  }, [columns]);
  return { columns, failed, load };
};

// Downloads a tab's sample CSV, one at a time
export const useSampleDownload = () => {
  const [downloading, setDownloading] = useState<SampleKind | null>(null);
  const download = useCallback(async (kind: SampleKind) => {
    setDownloading(kind);
    try {
      saveBlob(await timetablingService.downloadSample(kind), `${kind}-sample.csv`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, `Unable to download the ${SAMPLE_LABELS[kind].toLowerCase()} sample`));
    } finally {
      setDownloading(null);
    }
  }, []);
  return { downloading, download };
};
