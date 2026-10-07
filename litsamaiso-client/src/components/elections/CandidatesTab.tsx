import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  CircleCheck,
  FileSpreadsheet,
  ImagePlus,
  Lock,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  UploadCloud,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Candidate, CandidateImportSummary, Election } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import { cn } from '../../lib/utils';
import { getCandidateName, getPositionId, getPositionTitle, isEditable, type PositionWithCandidates } from './electionHelpers';
import {
  Avatar,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Pill,
  inputClass,
} from './ui';

type CandidatesTabProps = {
  election: Election;
  positions: PositionWithCandidates[];
  onChanged: () => Promise<void>;
};

type CandidateForm = { fullName: string; studentId: string; party: string; manifesto: string; image: File | null };

const toFormData = (form: CandidateForm) => {
  const formData = new FormData();
  formData.append('fullName', form.fullName);
  formData.append('studentId', form.studentId);
  if (form.party) formData.append('party', form.party);
  if (form.manifesto) formData.append('manifesto', form.manifesto);
  if (form.image) formData.append('image', form.image);
  return formData;
};

const CandidatesTab: React.FC<CandidatesTabProps> = ({ election, positions, onChanged }) => {
  const editable = isEditable(election);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<string | null>(null); // position id to preselect, '' for none
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [deleting, setDeleting] = useState<Candidate | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return positions;
    return positions
      .map((p) => ({
        ...p,
        candidates: p.candidates.filter((c) =>
          `${getCandidateName(c)} ${c.studentId || ''} ${c.party || ''}`.toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.candidates.length > 0);
  }, [positions, query]);

  const total = positions.reduce((sum, p) => sum + p.candidates.length, 0);

  const setStanding = async (candidate: Candidate, action: 'approve' | 'disqualify', silent = false) => {
    if (!candidate._id) return;
    setRowBusy(candidate._id);
    try {
      if (action === 'approve') await electionService.approveCandidate(candidate._id);
      else await electionService.disqualifyCandidate(candidate._id);
      await onChanged();
      if (!silent) {
        const name = getCandidateName(candidate);
        if (action === 'disqualify') {
          toast.success(`${name} disqualified`, {
            description: 'Hidden from the ballot.',
            action: { label: 'Undo', onClick: () => void setStanding(candidate, 'approve', true) },
          });
        } else {
          toast.success(`${name} reinstated`, { description: 'Back on the ballot.' });
        }
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not update the candidate'));
    } finally {
      setRowBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting?._id) return;
    setDeleteBusy(true);
    try {
      await electionService.deleteCandidate(deleting._id);
      toast.success(`${getCandidateName(deleting)} removed`);
      setDeleting(null);
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not remove the candidate'));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${total} candidate${total === 1 ? '' : 's'}`}
            aria-label="Search candidates"
            className={cn(inputClass, 'py-2 pl-9')}
          />
        </div>
        {editable ? (
          <div className="flex gap-2">
            <Button variant="secondary" icon={FileSpreadsheet} onClick={() => setImporting(true)} disabled={!positions.length}>
              Import
            </Button>
            <Button icon={UserPlus} onClick={() => setAdding('')} disabled={!positions.length}>
              Add candidate
            </Button>
          </div>
        ) : (
          <Pill>
            <Lock className="h-3 w-3" />
            Locked while voting is underway
          </Pill>
        )}
      </Card>

      {positions.length === 0 ? (
        <Card>
          <EmptyState icon={UsersRound} title="Add positions first" description="Candidates stand for a position." />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No matches" description={`Nobody matches “${query}”.`} />
        </Card>
      ) : (
        <>
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.filter((p) => p.candidates.length > 0).map((position) => (
            <Card key={position._id || position.title}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                <h3 className="truncate text-sm font-semibold text-primary-clr">{getPositionTitle(position)}</h3>
                <span className="text-xs font-medium tabular-nums text-slate-400">{position.candidates.length}</span>
              </div>
              {(
                <ul className="divide-y divide-slate-100">
                  {position.candidates.map((candidate) => {
                    const name = getCandidateName(candidate);
                    const busy = rowBusy === candidate._id;
                    return (
                      <li
                        key={candidate._id || name}
                        className={cn('group flex items-center gap-3 px-5 py-3', candidate.disqualified && 'opacity-60')}
                      >
                        <Avatar name={name} imageUrl={candidate.imageUrl} />
                        <div className="min-w-0 flex-1">
                          <p className={cn('truncate text-sm font-medium text-primary-clr', candidate.disqualified && 'line-through')}>
                            {name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {candidate.studentId || 'No student ID'} · {candidate.party || 'Independent'}
                          </p>
                        </div>
                        {candidate.disqualified ? (
                          <Pill tone="red">Disqualified</Pill>
                        ) : candidate.approved ? (
                          <Pill tone="green">
                            <CircleCheck className="h-3 w-3" />
                            On ballot
                          </Pill>
                        ) : (
                          <Pill tone="amber">Pending</Pill>
                        )}
                        {editable && (
                          <div className="flex opacity-60 transition group-hover:opacity-100">
                            <IconButton label={`Edit ${name}`} icon={Pencil} onClick={() => setEditing(candidate)} />
                            {candidate.disqualified || !candidate.approved ? (
                              <IconButton
                                label={`Reinstate ${name}`}
                                icon={RotateCcw}
                                tone="success"
                                loading={busy}
                                onClick={() => void setStanding(candidate, 'approve')}
                              />
                            ) : (
                              <IconButton
                                label={`Disqualify ${name}`}
                                icon={Ban}
                                tone="danger"
                                loading={busy}
                                onClick={() => void setStanding(candidate, 'disqualify')}
                              />
                            )}
                            <IconButton label={`Remove ${name}`} icon={Trash2} tone="danger" onClick={() => setDeleting(candidate)} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
        {!query && filtered.some((p) => p.candidates.length === 0) && (
          <Card className="p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <TriangleAlert className="h-4 w-4" />
              No candidates yet — these positions won't be on the ballot
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {filtered
                .filter((p) => p.candidates.length === 0)
                .map((position) =>
                  editable ? (
                    <button
                      key={position._id}
                      type="button"
                      onClick={() => setAdding(getPositionId(position))}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-primary-clr transition hover:border-active/50 hover:text-active"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {getPositionTitle(position)}
                    </button>
                  ) : (
                    <Pill key={position._id}>{getPositionTitle(position)}</Pill>
                  ),
                )}
            </div>
          </Card>
        )}
        </>
      )}

      {adding !== null && (
        <CandidateModal
          mode="add"
          positions={positions}
          initialPositionId={adding || getPositionId(positions[0] || {})}
          onClose={() => setAdding(null)}
          onSave={async (positionId, form) => {
            await electionService.addCandidate(election._id, positionId, toFormData(form));
            const position = positions.find((p) => p._id === positionId);
            toast.success(`${form.fullName} added`, {
              description: position ? `Standing for ${getPositionTitle(position)}.` : undefined,
            });
            setAdding(null);
            await onChanged();
          }}
        />
      )}

      {editing && (
        <CandidateModal
          mode="edit"
          candidate={editing}
          onClose={() => setEditing(null)}
          onSave={async (_positionId, form) => {
            await electionService.updateCandidate(editing._id as string, toFormData(form));
            toast.success(`${form.fullName} updated`);
            setEditing(null);
            await onChanged();
          }}
        />
      )}

      {importing && <ImportModal electionId={election._id} onClose={() => setImporting(false)} onImported={onChanged} />}

      <ConfirmModal
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this candidate?"
        description={deleting ? `${getCandidateName(deleting)} will be removed from this election.` : undefined}
        confirmLabel="Remove"
        tone="danger"
        busy={deleteBusy}
        onConfirm={handleDelete}
      />
    </div>
  );
};

const CandidateModal = ({
  mode,
  positions = [],
  initialPositionId = '',
  candidate,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  positions?: PositionWithCandidates[];
  initialPositionId?: string;
  candidate?: Candidate;
  onClose: () => void;
  onSave: (positionId: string, form: CandidateForm) => Promise<void>;
}) => {
  const [positionId, setPositionId] = useState(initialPositionId);
  const [form, setForm] = useState<CandidateForm>({
    fullName: candidate ? getCandidateName(candidate) : '',
    studentId: candidate?.studentId || '',
    party: candidate?.party || '',
    manifesto: candidate?.manifesto || candidate?.description || '',
    image: null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const localPreview = useMemo(() => (form.image ? URL.createObjectURL(form.image) : null), [form.image]);
  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);
  const preview = localPreview || candidate?.imageUrl;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(positionId, form);
    } catch (err: unknown) {
      // Shown inline so SAAD can fix the field (e.g. an unknown student ID) without losing the form
      setError(getApiErrorMessage(err, 'Could not save the candidate'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !saving && onClose()}
      title={mode === 'add' ? 'Add candidate' : 'Edit candidate'}
    >
      <form id="candidate-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="group relative cursor-pointer">
            <Avatar name={form.fullName || '?'} imageUrl={preview} size="lg" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-primary-clr/50 text-white opacity-0 transition group-hover:opacity-100">
              <ImagePlus className="h-5 w-5" />
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Candidate photo"
              onChange={(e) => setForm((p) => ({ ...p, image: e.target.files?.[0] || null }))}
            />
          </label>
          <div className="text-xs text-slate-500">
            <p className="font-semibold text-primary-clr">Photo</p>
            <p>{form.image ? form.image.name : 'Optional · shown on the ballot'}</p>
          </div>
        </div>

        {mode === 'add' && (
          <Field label="Position">
            <select value={positionId} onChange={(e) => setPositionId(e.target.value)} required className={inputClass}>
              {positions.map((p) => (
                <option key={p._id} value={p._id}>
                  {getPositionTitle(p)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input
              autoFocus
              required
              minLength={3}
              value={form.fullName}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Student ID" hint="Must be active in the registry">
            <input
              required
              value={form.studentId}
              onChange={(e) => {
                setError('');
                setForm((p) => ({ ...p, studentId: e.target.value }));
              }}
              className={cn(inputClass, error && 'border-red-300 focus:border-red-400 focus:ring-red-100')}
            />
          </Field>
        </div>
        <Field label="Party">
          <input
            value={form.party}
            onChange={(e) => setForm((p) => ({ ...p, party: e.target.value }))}
            placeholder="Independent"
            className={inputClass}
          />
        </Field>
        <Field label="Manifesto">
          <textarea
            rows={3}
            value={form.manifesto}
            onChange={(e) => setForm((p) => ({ ...p, manifesto: e.target.value }))}
            placeholder="Optional"
            className={inputClass}
          />
        </Field>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </form>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="candidate-form" loading={saving}>
          {mode === 'add' ? 'Add candidate' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
};

const ImportModal = ({
  electionId,
  onClose,
  onImported,
}: {
  electionId: string;
  onClose: () => void;
  onImported: () => Promise<void>;
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [summary, setSummary] = useState<CandidateImportSummary | null>(null);

  const upload = async (file: File) => {
    if (!/\.(csv|xlsx?|xls)$/i.test(file.name)) {
      toast.error('Unsupported file', { description: 'Upload a CSV or Excel file.' });
      return;
    }
    setFileName(file.name);
    setUploading(true);
    setSummary(null);
    try {
      const result = await electionService.importCandidates(electionId, file);
      setSummary(result.summary);
      const { importedCandidates, skippedCandidates } = result.summary;
      if (importedCandidates > 0) {
        toast.success(`${importedCandidates} candidate${importedCandidates === 1 ? '' : 's'} imported`, {
          description: skippedCandidates ? `${skippedCandidates} skipped — see details.` : undefined,
        });
      } else {
        toast.warning('Nothing imported', { description: 'Check the skipped rows.' });
      }
      await onImported();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not import the file'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && !uploading && onClose()}
      title="Import candidates"
      description="Columns: Position, Candidate, Student ID — plus Party and Manifesto if you have them."
      size="lg"
      footer={
        <Button variant={summary ? 'primary' : 'secondary'} onClick={onClose} disabled={uploading}>
          {summary ? 'Done' : 'Cancel'}
        </Button>
      }
    >
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
          dragging ? 'border-active bg-active/5' : 'border-slate-200 hover:border-active/50 hover:bg-slate-50',
          uploading && 'pointer-events-none opacity-70',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-active/10 text-active">
          <UploadCloud className={cn('h-6 w-6', uploading && 'animate-bounce')} />
        </span>
        <p className="font-semibold text-primary-clr">{uploading ? `Importing ${fileName}…` : 'Drop a spreadsheet or click to browse'}</p>
        <p className="mt-1 text-xs text-slate-500">CSV, XLS or XLSX · every candidate is checked against the registry</p>
      </label>

      {summary && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Rows', value: summary.rowsRead, tone: 'text-primary-clr' },
              { label: 'Imported', value: summary.importedCandidates, tone: 'text-emerald-600' },
              { label: 'Skipped', value: summary.skippedCandidates, tone: summary.skippedCandidates ? 'text-amber-600' : 'text-slate-400' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-slate-50 p-3">
                <p className={cn('text-2xl font-bold tabular-nums', stat.tone)}>{stat.value}</p>
                <p className="text-xs font-medium text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
          {summary.warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50">
              <p className="flex items-center gap-2 border-b border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-900">
                <TriangleAlert className="h-4 w-4" />
                {summary.warnings.length} row{summary.warnings.length === 1 ? '' : 's'} need attention
              </p>
              <ul className="max-h-48 divide-y divide-amber-100 overflow-y-auto text-sm text-amber-900">
                {summary.warnings.map((warning, index) => (
                  <li key={`${warning.rowNumber || 'general'}-${index}`} className="flex gap-3 px-4 py-2">
                    {warning.rowNumber && (
                      <span className="shrink-0 font-mono text-xs leading-5 text-amber-700">Row {warning.rowNumber}</span>
                    )}
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default CandidatesTab;
