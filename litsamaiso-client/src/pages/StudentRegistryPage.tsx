import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Edit, Eye, Loader2, Plus, RefreshCcw, Search, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../utils/apiError';
import { registryService, type RegistryDashboard, type RegistryException, type RegistryExceptionResult, type RegistryProgress, type RegistryStudent } from '../services/registryService';

type Tab = 'records' | 'exceptions';
type StudentForm = { name: string; surname: string; email: string; studentId: string; nationalId: string; studentStatus: boolean; borrowerNumber: string };
type UploadState = RegistryProgress & { kind: 'students' | 'financial'; fileName: string; status: 'running' | 'completed' | 'error' };

const emptyForm: StudentForm = { name: '', surname: '', email: '', studentId: '', nationalId: '', studentStatus: true, borrowerNumber: '' };
const tabFromUrl = (): Tab => new URLSearchParams(window.location.search).get('tab') === 'exceptions' ? 'exceptions' : 'records';

const UploadAction: React.FC<{ label: string; disabled: boolean; onChoose: (file: File) => void }> = ({ label, disabled, onChoose }) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-md bg-button px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
        <Upload className="h-4 w-4" />{disabled ? 'Importing...' : label}
      </button>
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onChoose(file); }} />
    </div>
  );
};

const ImportProgressModal: React.FC<{ state: UploadState | null }> = ({ state }) => {
  if (!state) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-blue-100 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {state.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-blue-700" /> : state.status === 'completed' ? <CheckCircle className="h-4 w-4 text-green-700" /> : <AlertTriangle className="h-4 w-4 text-red-700" />}
              <h3 className="text-sm font-semibold text-gray-900">{state.kind === 'financial' ? 'Financial clearance import' : 'Student import'}</h3>
            </div>
            <p className="mt-1 text-sm text-gray-600">{state.message}: {state.fileName}</p>
          </div>
          <span className="text-sm font-semibold text-blue-800">{state.percent}%</span>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full transition-all duration-300 ${state.status === 'error' ? 'bg-red-600' : 'bg-blue-600'}`} style={{ width: `${state.percent}%` }} />
        </div>
        <div className="mt-4 grid gap-2 text-xs text-gray-700 sm:grid-cols-4">
          <span>Processed {state.processed ?? 0}{state.total ? `/${state.total}` : ''}</span>
          <span>Inserted {state.inserted ?? 0}</span>
          <span>Skipped {state.skipped ?? 0}</span>
          <span>Errors {state.errors ?? 0}</span>
        </div>
      </div>
    </div>
  );
};

const StudentModal: React.FC<{ title: string; initial: StudentForm; showIdentifiers: boolean; onClose: () => void; onSubmit: (form: StudentForm) => Promise<void> }> = ({ title, initial, showIdentifiers, onClose, onSubmit }) => {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof StudentForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await onSubmit(form); } finally { setBusy(false); } };
  const fields: Array<[keyof StudentForm, string]> = [['name', 'Name'], ['surname', 'Surname'], ...(showIdentifiers ? [['email', 'Email'], ['studentId', 'Student ID']] as Array<[keyof StudentForm, string]> : []), ['nationalId', "Student's National ID"], ['borrowerNumber', 'Borrower Number']];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-950/40" />
      <form onSubmit={submit} className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4"><h2 className="text-lg font-semibold text-slate-950">{title}</h2><button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{fields.map(([key, label]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<input value={String(form[key])} onChange={(event) => set(key, event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal outline-none focus:border-active-clr" /></label>)}</div>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.studentStatus} onChange={(event) => set('studentStatus', event.target.checked)} /> Active student</label>
        <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button><button disabled={busy} className="rounded-md bg-button px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving...' : 'Save changes'}</button></div>
      </form>
    </div>
  );
};

const ReportCard: React.FC<{ label: string; value: number; percent?: number }> = ({ label, value, percent }) => (
  <div className="rounded-lg bg-white p-6 shadow">
    <p className="text-sm font-medium text-gray-600">{label}</p>
    <div className="flex items-baseline justify-between">
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      {typeof percent === 'number' && <p className="text-sm text-gray-500">{percent}%</p>}
    </div>
    {typeof percent === 'number' && (
      <div className="mt-3 h-2 w-full rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-active" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    )}
  </div>
);

type ExceptionForm = { fullnames: string; nationalId: string; borrowerNumber: string; courseOfStudy: string; bankName: string; accountNumber: string };

const ExceptionModal: React.FC<{ exception: RegistryException; onClose: () => void; onChanged: () => void }> = ({ exception, onClose, onChanged }) => {
  const [form, setForm] = useState<ExceptionForm>({ fullnames: exception.fullnames || '', nationalId: exception.nationalId || '', borrowerNumber: exception.borrowerNumber || '', courseOfStudy: exception.courseOfStudy || '', bankName: exception.bankName || '', accountNumber: exception.accountNumber || '' });
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [result, setResult] = useState<RegistryExceptionResult | null>(null);
  const set = (key: keyof ExceptionForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const status = result ? { classification: result.classification, reasons: result.reasons } : { classification: exception.classification, reasons: exception.reasons };
  const reconciliation = result?.reconciliation;
  const statusTone = status.classification === 'matched' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : status.classification === 'conflict' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const updated = await registryService.updateException(exception.importId, exception.rowNumber, { ...form, autoReconcile: true });
      setResult(updated);
      if (updated.reconciliation?.reconciled && updated.reconciliation.assigned) toast.success(updated.reconciliation.message);
      else if (updated.reconciliation?.reconciled) toast.success(updated.reconciliation.message);
      else toast.warning(updated.reconciliation?.message || 'Exception updated');
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to update exception'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await registryService.deleteException(exception.importId, exception.rowNumber);
      toast.success('Exception deleted');
      onChanged();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to delete exception'));
    } finally {
      setBusy(false);
    }
  };

  const fields: Array<[keyof ExceptionForm, string]> = [['fullnames', 'Full Names'], ['nationalId', "Student's National ID"], ['borrowerNumber', 'Borrower Number'], ['courseOfStudy', 'Course of Study'], ['bankName', 'Bank Name'], ['accountNumber', 'Account Number']];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-950/40" />
      <form onSubmit={submit} className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Exception record</h2>
            <p className="mt-0.5 text-sm text-slate-500">Row {exception.rowNumber} &middot; Correct the National ID to reconcile automatically.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className={`mt-4 rounded-md border px-3 py-2.5 text-sm ${statusTone}`}>
          <span className="font-semibold capitalize">{String(status.classification).replace('/', ' / ')}</span>
          <span className="ml-2">{status.reasons?.join(', ')}</span>
        </div>
        {reconciliation && (
          <div className={`mt-3 rounded-md border px-3 py-2.5 text-sm ${reconciliation.reconciled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
            {reconciliation.message}
          </div>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{fields.map(([key, label]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<input value={form[key]} onChange={(event) => set(key, event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal outline-none focus:border-active-clr" /></label>)}</div>
        {confirmingDelete ? (
          <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">Are you sure you want to delete this exception record? This cannot be undone.</p>
            <div className="mt-3 flex justify-end gap-3">
              <button type="button" disabled={busy} onClick={() => setConfirmingDelete(false)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Keep</button>
              <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Deleting...' : 'Confirm delete'}</button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button type="button" disabled={busy} onClick={() => setConfirmingDelete(true)} className="rounded-md border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">Delete exception</button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button disabled={busy} className="rounded-md bg-button px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Saving...' : 'Save changes'}</button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

const StudentRegistryPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const [students, setStudents] = useState<RegistryStudent[]>([]);
  const [exceptions, setExceptions] = useState<RegistryException[]>([]);
  const [stats, setStats] = useState<RegistryDashboard['stats']>({ totalRegistered: 0, assigned: 0, missing: 0, conflicts: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [borrower, setBorrower] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [modal, setModal] = useState<{ mode: 'edit' | 'add'; student?: RegistryStudent } | { mode: 'view'; exception: RegistryException } | null>(null);

  const loadStudents = useCallback(async () => { setLoading(true); try { const result = await registryService.listStudents({ search, status, borrower, page, limit: 25 }); setStudents(result.items); setPages(Math.max(1, result.pagination.pages)); } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to load students')); } finally { setLoading(false); } }, [borrower, page, search, status]);
  const loadExceptions = useCallback(async () => { setLoading(true); try { setExceptions(await registryService.listExceptions()); } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to load exceptions')); } finally { setLoading(false); } }, []);
  const loadDashboard = useCallback(async () => { try { const dashboard = await registryService.getDashboard(); setStats(dashboard.stats); } catch { /* summary cards stay at last known values */ } }, []);
  useEffect(() => { const timer = window.setTimeout(() => { if (tab === 'records') void loadStudents(); else void loadExceptions(); void loadDashboard(); }, 200); return () => window.clearTimeout(timer); }, [tab, loadDashboard, loadExceptions, loadStudents]);

  const changeTab = (next: Tab) => { setTab(next); setPage(1); window.history.replaceState({}, '', `${window.location.pathname}${next === 'exceptions' ? '?tab=exceptions' : ''}`); };
  const refreshCurrent = useCallback(() => { if (tab === 'records') void loadStudents(); else void loadExceptions(); void loadDashboard(); }, [tab, loadDashboard, loadExceptions, loadStudents]);
  const runUpload = async (kind: 'students' | 'financial', file: File) => {
    setUploadState({ kind, fileName: file.name, status: 'running', percent: 0, message: 'Preparing spreadsheet', processed: 0, total: 0, inserted: 0, skipped: 0, errors: 0 });
    const progress = (state: RegistryProgress) => setUploadState((current) => current ? { ...current, ...state, status: state.type === 'error' ? 'error' : state.type === 'completed' ? 'completed' : 'running' } : current);
    try {
      const imported = kind === 'students' ? await registryService.uploadStudents(file, progress) : await registryService.uploadFinancial(file, progress);
      progress({ type: 'progress', percent: 100, message: kind === 'students' ? 'Applying validated student records' : 'Applying exact National ID matches' });
      const applied = await registryService.applyImport(imported._id);
      progress({ type: 'progress', percent: 100, message: 'Applying validated records', inserted: applied.applied, skipped: applied.skipped.length });
      progress({ type: 'completed', percent: 100, message: 'Import completed' });
      toast.success(kind === 'students' ? 'Students imported and validated' : 'Financial Clearance imported and reconciled');
      await Promise.all([loadStudents(), loadExceptions(), loadDashboard()]);
      window.setTimeout(() => setUploadState(null), 1200);
    } catch (error) { setUploadState((current) => current ? { ...current, status: 'error', percent: 100, message: getApiErrorMessage(error, 'Import failed'), errors: Math.max(1, current.errors || 0) } : current); toast.error(getApiErrorMessage(error, 'Import failed')); }
  };

  const saveStudent = async (form: StudentForm) => { try { if (modal && modal.mode === 'edit' && modal.student) await registryService.updateStudent(modal.student._id, form); else await registryService.createStudent(form); toast.success('Student saved'); setModal(null); await Promise.all([loadStudents(), loadDashboard()]); } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to save student')); } };
  const deleteStudent = async (student: RegistryStudent) => { if (!window.confirm(`Delete ${student.name} ${student.surname}?`)) return; try { await registryService.deleteStudent(student._id); toast.success('Student deleted'); await Promise.all([loadStudents(), loadExceptions(), loadDashboard()]); } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to delete student')); } };
  const searchExceptionStudent = async (item: RegistryException) => {
    const nationalId = String(item.nationalId || '').trim();
    if (!nationalId) { toast.error('This exception has no National ID to search for'); return; }
    try {
      await registryService.searchStudentByNationalId(nationalId);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'No student found with this National ID'));
      return;
    }
    setTab('records');
    setPage(1);
    setSearch(nationalId);
    window.history.replaceState({}, '', window.location.pathname);
  };

  const assignedPercent = stats.totalRegistered > 0 ? Math.round((stats.assigned / stats.totalRegistered) * 100) : 0;
  const missingPercent = stats.totalRegistered > 0 ? Math.round((stats.missing / stats.totalRegistered) * 100) : 0;

  return <div className="global-bg min-h-screen pt-5 pb-14"><div className="mx-auto max-w-6xl space-y-6 px-4">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-primary-clr">Student Registry</h1><p className="mt-1 text-sm text-muted-foreground">Manage registered students and reconcile Financial Clearance records.</p></div><button type="button" onClick={() => refreshCurrent()} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><RefreshCcw className="h-4 w-4" /> Refresh</button></header>
    <div className="rounded-md bg-white shadow-sm"><nav className="flex items-center gap-6 px-4 py-3"><button onClick={() => changeTab('records')} className={`border-b-2 pb-2 text-sm font-medium ${tab === 'records' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'}`}>Student Records</button><button onClick={() => changeTab('exceptions')} className={`border-b-2 pb-2 text-sm font-medium ${tab === 'exceptions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'}`}>Exceptions</button></nav></div>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ReportCard label="Total Registered Students" value={stats.totalRegistered} />
      <ReportCard label="Borrower Numbers Assigned" value={stats.assigned} percent={assignedPercent} />
      <ReportCard label="Missing Borrower Numbers" value={stats.missing} percent={missingPercent} />
      <ReportCard label="Conflicts" value={stats.conflicts} />
    </section>
    {tab === 'records' && <><section className="rounded-lg bg-white p-5 shadow"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-gray-900">Import records</h2><p className="text-sm text-muted-foreground">Both spreadsheets are validated before any borrower number is assigned.</p></div><div className="flex flex-wrap gap-2"><UploadAction label="Import Students" disabled={Boolean(uploadState)} onChoose={(file) => void runUpload('students', file)} /><UploadAction label="Import Financial Clearance List" disabled={Boolean(uploadState)} onChoose={(file) => void runUpload('financial', file)} /></div></div></section><section className="rounded-lg bg-white p-5 shadow"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-gray-900">Registered Students</h2><button type="button" onClick={() => setModal({ mode: 'add' })} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Plus className="h-4 w-4" /> Add student</button></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_180px]"><label className="relative block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email, National ID..." className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" /></label><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select value={borrower} onChange={(event) => { setBorrower(event.target.value); setPage(1); }} className="rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">All borrower numbers</option><option value="assigned">Assigned</option><option value="missing">Missing</option></select></div><div className="mt-5 overflow-hidden rounded-lg border border-slate-200"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200"><thead className="bg-slate-50"><tr>{['Full Name', 'Email', 'Student ID', 'Status', 'Borrower Number', 'Actions'].map((head) => <th key={head} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{head}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 bg-white">{loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : students.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No registered students found.</td></tr> : students.map((student) => <tr key={student._id} className="hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">{student.name} {student.surname}</td><td className="px-4 py-4 text-sm text-slate-600">{student.email}</td><td className="px-4 py-4 text-sm text-slate-600">{student.studentId}</td><td className="px-4 py-4 text-sm"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${student.studentStatus ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{student.studentStatus ? 'Active' : 'Inactive'}</span></td><td className="px-4 py-4 text-sm text-slate-600">{student.borrowerNumber || ''}</td><td className="whitespace-nowrap px-4 py-4 text-right text-sm"><button type="button" title="Edit student" aria-label="Edit student" onClick={() => setModal({ mode: 'edit', student })} className="mr-2 inline-flex rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"><Edit className="h-4 w-4" /></button><button type="button" title="Delete student" aria-label="Delete student" onClick={() => void deleteStudent(student)} className="inline-flex rounded-md border border-rose-200 p-2 text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span>Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50">Previous</button><button disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50">Next</button></div></div></div></section></>}
    {tab === 'exceptions' && <section className="rounded-lg bg-white p-5 shadow"><div><h2 className="font-semibold text-gray-900">Financial Clearance Exceptions</h2><p className="text-sm text-muted-foreground">Unmatched and conflicting records are held here until reviewed.</p></div><div className="mt-5 overflow-hidden rounded-lg border border-slate-200"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200"><thead className="bg-slate-50"><tr>{['National ID', 'Full Name', 'Borrower Number', 'Course', 'Bank', 'Reason', 'Actions'].map((head) => <th key={head} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{head}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={7} className="px-4 py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : exceptions.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No exceptions found.</td></tr> : exceptions.map((item) => <tr key={`${item.importId}-${item.rowNumber}`}><td className="px-4 py-4 text-sm font-semibold text-slate-900">{item.nationalId || '-'}</td><td className="px-4 py-4 text-sm text-slate-600">{item.fullnames || '-'}</td><td className="px-4 py-4 text-sm text-slate-600">{item.borrowerNumber || '-'}</td><td className="px-4 py-4 text-sm text-slate-600">{item.courseOfStudy || '-'}</td><td className="px-4 py-4 text-sm text-slate-600">{item.bankName || '-'}</td><td className="max-w-xs px-4 py-4 text-sm text-rose-700">{item.reasons?.join(', ') || item.classification}</td><td className="whitespace-nowrap px-4 py-4 text-right text-sm"><button type="button" title="View exception record" aria-label="View exception record" onClick={() => setModal({ mode: 'view', exception: item })} className="mr-2 inline-flex rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"><Eye className="h-4 w-4" /></button><button type="button" title="Find student by National ID" aria-label="Find student by National ID" onClick={() => void searchExceptionStudent(item)} className="inline-flex rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"><Search className="h-4 w-4" /></button></td></tr>)}</tbody></table></div></div></section>}
    {modal && ('exception' in modal
      ? <ExceptionModal exception={modal.exception} onClose={() => setModal(null)} onChanged={() => void Promise.all([loadStudents(), loadExceptions(), loadDashboard()])} />
      : <StudentModal title={modal.mode === 'edit' ? 'Edit student' : 'Add student'} initial={modal.student ? { ...emptyForm, ...modal.student, borrowerNumber: modal.student.borrowerNumber || '', nationalId: modal.student.nationalId || '' } : emptyForm} showIdentifiers={modal.mode === 'add'} onClose={() => setModal(null)} onSubmit={saveStudent} />)}
    <ImportProgressModal state={uploadState} />
  </div></div>;
};

export default StudentRegistryPage;
