import React, { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../../utils/apiError';
import { timetablingService, type ImportKind, type ImportResult, type LatestImport, type Term } from '../../services/timetablingService';
import { SAMPLE_KINDS, SAMPLE_LABELS, useSampleDownload } from './importSamples';
import { saveBlob } from '../../utils/saveBlob';
import { ConfirmDialog, Modal, secondaryButton } from './shared';
import { AcademicYearPicker, SemesterPicker } from './TermControls';

const KIND_LABELS: Record<ImportKind, string> = { rooms: 'Rooms', lecturers: 'Lecturers', modules: 'Modules', enrolments: 'Enrolments' };
const plural = (count: number, noun: string) => `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;

const Summary: React.FC<{ result: ImportResult }> = ({ result }) => (
  <div className="space-y-4">
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>{['Sheet', 'Rows', 'New', 'Updated', 'No change', 'Skipped'].map((head) => <th key={head} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">{head}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {result.sheets.map((sheet, index) => (
            <tr key={`${sheet.sheet}-${index}`}>
              <td className="px-3 py-2"><span className="font-medium text-slate-900">{sheet.sheet}</span>{sheet.sheet !== KIND_LABELS[sheet.kind] && <span className="text-slate-500"> · {KIND_LABELS[sheet.kind]}</span>}</td>
              <td className="px-3 py-2 tabular-nums text-slate-600">{sheet.rows}</td>
              <td className="px-3 py-2 tabular-nums font-semibold text-emerald-700">{sheet.added}</td>
              <td className="px-3 py-2 tabular-nums text-blue-700">{sheet.kind === 'enrolments' ? '–' : sheet.updated}</td>
              <td className="px-3 py-2 tabular-nums text-slate-500">{sheet.unchanged}</td>
              <td className={`px-3 py-2 tabular-nums ${sheet.skipped ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>{sheet.skipped}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {result.ignoredSheets.length > 0 && (
      <p className="text-sm text-slate-600">Not read: {result.ignoredSheets.map((name) => `“${name}”`).join(', ')}. Their columns don't match any of the template's sheets.</p>
    )}
    {result.issueCount > 0 && (
      <div className="rounded-lg border border-amber-200 bg-amber-50">
        <p className="flex items-center gap-2 border-b border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-900">
          <TriangleAlert className="h-4 w-4" /> {plural(result.issueCount, 'row')} {result.applied ? 'were' : 'will be'} skipped
        </p>
        <ul className="max-h-56 divide-y divide-amber-100 overflow-y-auto text-sm text-amber-900">
          {result.issues.map((issue, index) => (
            <li key={index} className="flex gap-3 px-4 py-2">
              <span className="w-28 shrink-0 font-mono text-xs leading-5 text-amber-700">{issue.sheet}{issue.row ? ` row ${issue.row}` : ''}</span>
              <span>{issue.message}</span>
            </li>
          ))}
          {result.issueCount > result.issues.length && <li className="px-4 py-2 text-amber-700">…and {plural(result.issueCount - result.issues.length, 'more row')}</li>}
        </ul>
      </div>
    )}
  </div>
);

const ImportModal: React.FC<{ term: Term; onClose: () => void; onImported: () => void }> = ({ term, onClose, onImported }) => {
  const [target, setTarget] = useState<Term>(term);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [working, setWorking] = useState<'checking' | 'confirming' | 'importing' | 'template' | null>(null);
  // Set when the term already had an import, or when that couldn't be checked, to ask before importing again
  const [repeat, setRepeat] = useState<{ previous: LatestImport | null } | null>(null);
  const [dragging, setDragging] = useState(false);
  const sample = useSampleDownload();

  const check = async (chosen: File, into: Term) => {
    if (!/\.(xlsx|xls|csv)$/i.test(chosen.name)) {
      toast.error('Upload an Excel (.xlsx or .xls) or CSV file');
      return;
    }
    setFile(chosen);
    setPreview(null);
    setWorking('checking');
    try {
      setPreview(await timetablingService.importSpreadsheet(chosen, into, false));
    } catch (error) {
      setFile(null);
      toast.error(getApiErrorMessage(error, 'Unable to read the file'));
    } finally {
      setWorking(null);
    }
  };

  // The preview depends on the term, because modules and enrolments are matched within it
  const changeTerm = (next: Term) => {
    setTarget(next);
    if (file) void check(file, next);
  };

  const importFile = async () => {
    if (!file || !preview?.changes) return;
    setWorking('importing');
    try {
      const result = await timetablingService.importSpreadsheet(file, target, true);
      setDone(result);
      toast.success(result.changes ? `Imported ${plural(result.changes, 'change')}` : 'Nothing needed changing');
      onImported();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to import the file'));
    } finally {
      setWorking(null);
    }
  };

  // Importing into a term that already had an import is allowed, but only once Registry has seen it
  const requestImport = async () => {
    if (!file || !preview?.changes) return;
    setWorking('confirming');
    let previous: LatestImport | null;
    try {
      previous = await timetablingService.latestImport(target);
    } catch {
      setWorking(null);
      setRepeat({ previous: null });
      return;
    }
    setWorking(null);
    if (previous) setRepeat({ previous });
    else await importFile();
  };

  const confirmRepeat = () => {
    setRepeat(null);
    void importFile();
  };

  const downloadTemplate = async () => {
    setWorking('template');
    try {
      saveBlob(await timetablingService.downloadImportTemplate(), 'room-allocation-template.xlsx');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to download the template'));
    } finally {
      setWorking(null);
    }
  };

  const canImport = Boolean(preview?.changes) && !done;
  return (
    <Modal
      wide
      title="Import from Excel"
      subtitle="Rooms, lecturers, modules and the students in each module"
      busy={working === 'importing' || working === 'confirming'}
      busyLabel={working === 'confirming' ? 'Checking...' : 'Importing...'}
      submitLabel={`Import ${plural(preview?.changes ?? 0, 'change')}`}
      onClose={() => { if (working !== 'importing') onClose(); }}
      {...(canImport ? { onSubmit: requestImport } : {})}
    >
      {done ? (
        <>
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-5 w-5" /> {file?.name} was imported into {done.term.academicYear} semester {done.term.semester}.
          </p>
          <Summary result={done} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="max-w-md">
              Use one sheet each for Rooms, Lecturers, Modules and Enrolments, and fill in only the ones you need. Existing rooms, lecturers and modules are updated from the file. Nothing is deleted.
            </p>
            <button type="button" onClick={() => void downloadTemplate()} disabled={working !== null} className={secondaryButton}>
              {working === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download template
            </button>
            <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
              <span className="text-xs font-medium text-slate-500">Or one CSV per tab:</span>
              {SAMPLE_KINDS.map((kind) => (
                <button key={kind} type="button" onClick={() => void sample.download(kind)} disabled={working !== null || sample.downloading !== null} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  {sample.downloading === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {SAMPLE_LABELS[kind]} sample
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <AcademicYearPicker value={target.academicYear} disabled={working !== null} onChange={(academicYear) => changeTerm({ ...target, academicYear })} />
            <SemesterPicker value={target.semester} disabled={working !== null} onChange={(semester) => changeTerm({ ...target, semester })} />
            <p className="text-sm text-slate-500">Modules and enrolments go into this semester.</p>
          </div>

          <label
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped && working === null) void check(dropped, target);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'} ${working ? 'pointer-events-none opacity-70' : ''}`}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                event.target.value = '';
                if (chosen) void check(chosen, target);
              }}
            />
            {working === 'checking' ? <Loader2 className="mb-2 h-7 w-7 animate-spin text-blue-600" /> : file ? <FileSpreadsheet className="mb-2 h-7 w-7 text-emerald-600" /> : <UploadCloud className="mb-2 h-7 w-7 text-blue-600" />}
            <p className="font-semibold text-slate-900">{working === 'checking' ? `Checking ${file?.name}...` : file ? file.name : 'Drop a spreadsheet here or click to choose one'}</p>
            <p className="mt-1 text-xs text-slate-500">{file ? 'Click to choose a different file' : 'Excel (.xlsx, .xls) or CSV, up to 10 MB'}</p>
          </label>

          {preview && (
            <>
              <p className="text-sm font-medium text-slate-800">
                {preview.changes
                  ? `Importing will make ${plural(preview.changes, 'change')} in ${preview.term.academicYear} semester ${preview.term.semester}. Nothing has been saved yet.`
                  : 'This file matches what is already saved, so there is nothing to import.'}
              </p>
              <Summary result={preview} />
            </>
          )}
        </>
      )}
      <ConfirmDialog
        open={repeat !== null}
        title={repeat?.previous ? `${target.academicYear} semester ${target.semester} already has an import` : `Couldn't check ${target.academicYear} semester ${target.semester}`}
        confirmLabel="Import anyway"
        onConfirm={confirmRepeat}
        onCancel={() => setRepeat(null)}
      >
        {repeat?.previous ? (
          <p>
            <span className="font-semibold text-slate-800">{repeat.previous.fileName}</span> was imported
            {repeat.previous.importedByEmail ? <> by <span className="font-semibold text-slate-800">{repeat.previous.importedByEmail}</span></> : null} on {new Date(repeat.previous.importedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}, with {plural(repeat.previous.changes, 'change')}.
          </p>
        ) : (
          <p>We couldn't find out whether this semester already has an import.</p>
        )}
        <p>Importing {file?.name} updates the rooms, lecturers and modules that match and adds the new ones. Nothing is deleted.</p>
      </ConfirmDialog>
    </Modal>
  );
};

export default ImportModal;
