import React, { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, TriangleAlert, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { academicYearInputProps } from '../elections/electionHelpers';
import { getApiErrorMessage } from '../../utils/apiError';
import { timetablingService, type ImportKind, type ImportResult, type Term } from '../../services/timetablingService';
import { Modal, secondaryButton } from './shared';

const KIND_LABELS: Record<ImportKind, string> = { rooms: 'Rooms', lecturers: 'Lecturers', modules: 'Modules', enrolments: 'Enrolments' };
const isAcademicYear = (value: string) => {
  const match = /^(\d{4})\/(\d{4})$/.exec(value);
  return Boolean(match) && Number(match?.[2]) === Number(match?.[1]) + 1;
};
const termClass = 'block rounded-md border px-3 py-2 text-sm outline-none focus:border-active-clr disabled:opacity-60';
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
  const [yearInput, setYearInput] = useState(term.academicYear);
  const [target, setTarget] = useState<Term>(term);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [working, setWorking] = useState<'checking' | 'importing' | 'template' | null>(null);
  const [dragging, setDragging] = useState(false);

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

  const downloadTemplate = async () => {
    setWorking('template');
    try {
      const blob = await timetablingService.downloadImportTemplate();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'room-allocation-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
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
      busy={working === 'importing'}
      busyLabel="Importing..."
      submitLabel={`Import ${plural(preview?.changes ?? 0, 'change')}`}
      onClose={() => { if (working !== 'importing') onClose(); }}
      {...(canImport ? { onSubmit: importFile } : {})}
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
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input {...academicYearInputProps} aria-label="Academic year" value={yearInput} disabled={working !== null} onChange={(event) => { setYearInput(event.target.value); if (isAcademicYear(event.target.value)) changeTerm({ ...target, academicYear: event.target.value }); }} className={`${termClass} w-32 ${isAcademicYear(yearInput) ? 'border-slate-300' : 'border-rose-400'}`} />
            <select aria-label="Semester" value={target.semester} disabled={working !== null} onChange={(event) => changeTerm({ ...target, semester: Number(event.target.value) })} className={`${termClass} border-slate-300`}>
              <option value={1}>Semester 1</option>
              <option value={2}>Semester 2</option>
            </select>
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
    </Modal>
  );
};

export default ImportModal;
