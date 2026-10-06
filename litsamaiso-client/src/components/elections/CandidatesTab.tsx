import React, { useRef, useState } from 'react';
import { Edit, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Candidate, CandidateImportSummary, Election } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import ConfirmDialog from './ConfirmDialog';
import {
  getCandidateName,
  getPositionId,
  getPositionTitle,
  isEditable,
  type PositionWithCandidates,
} from './electionHelpers';

type CandidatesTabProps = {
  election: Election;
  positions: PositionWithCandidates[];
  onChanged: () => Promise<void>;
};

type CandidateForm = {
  fullName: string;
  studentId: string;
  party: string;
  manifesto: string;
  image: File | null;
};

const emptyCandidateForm: CandidateForm = { fullName: '', studentId: '', party: '', manifesto: '', image: null };

const toFormData = (form: CandidateForm) => {
  const formData = new FormData();
  formData.append('fullName', form.fullName);
  formData.append('studentId', form.studentId);
  if (form.party) formData.append('party', form.party);
  if (form.manifesto) formData.append('manifesto', form.manifesto);
  if (form.image) formData.append('image', form.image);
  return formData;
};

const candidateBadge = (candidate: Candidate) => {
  if (candidate.disqualified) return { label: 'Disqualified', className: 'bg-red-100 text-red-700' };
  if (candidate.approved) return { label: 'Approved', className: 'bg-green-100 text-green-800' };
  return { label: 'Pending', className: 'bg-yellow-100 text-yellow-800' };
};

const CandidatesTab: React.FC<CandidatesTabProps> = ({ election, positions, onChanged }) => {
  const editable = isEditable(election);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [positionId, setPositionId] = useState('');
  const [form, setForm] = useState<CandidateForm>(emptyCandidateForm);
  const [isAdding, setIsAdding] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<CandidateImportSummary | null>(null);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [deleting, setDeleting] = useState<Candidate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedPositionId = positionId || getPositionId(positions[0] || {});

  const handleAddCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPositionId) {
      toast.error('Add a position first');
      return;
    }
    setIsAdding(true);
    try {
      await electionService.addCandidate(election._id, selectedPositionId, toFormData(form));
      toast.success('Candidate added');
      setForm(emptyCandidateForm);
      if (imageInputRef.current) imageInputRef.current.value = '';
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to add candidate'));
    } finally {
      setIsAdding(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportSummary(null);
    try {
      const result = await electionService.importCandidates(election._id, file);
      setImportSummary(result.summary);
      toast.success(`Imported ${result.summary.importedCandidates} candidate(s)`);
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to import candidates'));
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleCandidateAction = async (action: 'approve' | 'disqualify', candidateId: string) => {
    try {
      if (action === 'approve') {
        await electionService.approveCandidate(candidateId);
        toast.success('Candidate approved');
      } else {
        await electionService.disqualifyCandidate(candidateId);
        toast.success('Candidate disqualified');
      }
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Candidate action failed'));
    }
  };

  const handleDeleteCandidate = async () => {
    if (!deleting?._id) return;
    setIsDeleting(true);
    try {
      await electionService.deleteCandidate(deleting._id);
      toast.success('Candidate deleted');
      setDeleting(null);
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to delete candidate'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {editable && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form className="space-y-4 rounded-lg bg-white p-6 shadow" onSubmit={handleAddCandidate}>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Add Candidate</h2>
              <p className="text-sm text-gray-500">
                The student ID must belong to an active student in the registry. Candidates are approved when added.
              </p>
            </div>
            <select
              value={selectedPositionId}
              onChange={(event) => setPositionId(event.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {positions.length === 0 && <option value="">Add a position first</option>}
              {positions.map((position) => (
                <option key={position._id} value={position._id}>
                  {getPositionTitle(position)}
                </option>
              ))}
            </select>
            <CandidateFields form={form} setForm={setForm} imageInputRef={imageInputRef} imageLabel="Upload candidate photo" />
            <button
              type="submit"
              disabled={isAdding || positions.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-button py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAdding && <Loader2 className="h-5 w-5 animate-spin" />}
              {isAdding ? 'Adding candidate...' : 'Add Candidate'}
            </button>
          </form>

          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Bulk Import Candidates</h2>
                <p className="mt-1 text-sm text-gray-500">
                  CSV or Excel. Every candidate needs a Student ID that is active in the registry.
                </p>
              </div>
              <label
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 font-semibold text-white ${
                  isImporting ? 'cursor-not-allowed bg-gray-400' : 'cursor-pointer bg-button hover:opacity-90'
                }`}
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isImporting ? 'Importing...' : 'Upload Spreadsheet'}
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  disabled={isImporting}
                  onChange={handleImport}
                  className="sr-only"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-gray-600">
              <div className="rounded-md bg-gray-50 p-3">
                <p className="font-semibold text-gray-800">Long format</p>
                <p>Columns like Position, Candidate, Student ID, Party, Manifesto.</p>
              </div>
              <div className="rounded-md bg-gray-50 p-3">
                <p className="font-semibold text-gray-800">Position columns</p>
                <p>Columns named after the election's positions, e.g. President, President Student ID.</p>
              </div>
            </div>
            {importSummary && <ImportSummary summary={importSummary} />}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-white shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Candidates by Position</h2>
          <p className="text-sm text-gray-500">Students see every approved candidate. Disqualified candidates are hidden.</p>
        </div>
        {positions.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No positions yet.</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {positions.map((position) => (
              <div key={position._id || position.title} className="p-6">
                <h3 className="font-semibold text-gray-900">{getPositionTitle(position)}</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {position.candidates.length === 0 ? (
                    <p className="text-sm text-gray-500">No candidates yet.</p>
                  ) : (
                    position.candidates.map((candidate) => {
                      const badge = candidateBadge(candidate);
                      return (
                        <div key={candidate._id || candidate.fullName} className="rounded-lg border border-gray-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-gray-900">{getCandidateName(candidate)}</p>
                              <p className="text-sm text-gray-500">
                                {candidate.studentId || 'No student ID'} · {candidate.party || 'Independent'}
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                          {editable && candidate._id && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setEditing(candidate)}
                                className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                              >
                                <Edit size={14} />
                                Edit
                              </button>
                              {!candidate.approved && (
                                <button
                                  type="button"
                                  onClick={() => handleCandidateAction('approve', candidate._id as string)}
                                  className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                                >
                                  Approve
                                </button>
                              )}
                              {!candidate.disqualified && (
                                <button
                                  type="button"
                                  onClick={() => handleCandidateAction('disqualify', candidate._id as string)}
                                  className="rounded-md border px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                                >
                                  Disqualify
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setDeleting(candidate)}
                                className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditCandidateModal
          candidate={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await onChanged();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete candidate?"
          confirmLabel="Delete candidate"
          tone="danger"
          busy={isDeleting}
          onConfirm={handleDeleteCandidate}
          onCancel={() => setDeleting(null)}
        >
          <p>
            <strong>{getCandidateName(deleting)}</strong> will be removed from this election.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
};

const CandidateFields = ({
  form,
  setForm,
  imageInputRef,
  imageLabel,
}: {
  form: CandidateForm;
  setForm: React.Dispatch<React.SetStateAction<CandidateForm>>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;
  imageLabel: string;
}) => (
  <>
    <div className="grid gap-4 sm:grid-cols-2">
      <input
        value={form.fullName}
        onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
        placeholder="Full name"
        required
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      />
      <input
        value={form.studentId}
        onChange={(event) => setForm((prev) => ({ ...prev, studentId: event.target.value }))}
        placeholder="Student ID"
        required
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      />
    </div>
    <input
      value={form.party}
      onChange={(event) => setForm((prev) => ({ ...prev, party: event.target.value }))}
      placeholder="Party"
      className="w-full rounded-md border border-gray-300 px-3 py-2"
    />
    <textarea
      value={form.manifesto}
      onChange={(event) => setForm((prev) => ({ ...prev, manifesto: event.target.value }))}
      placeholder="Manifesto"
      className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2"
    />
    <label className="block rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 px-4 py-4 text-center transition hover:border-indigo-500 hover:bg-indigo-100">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onClick={(event) => {
          event.currentTarget.value = '';
        }}
        onChange={(event) => setForm((prev) => ({ ...prev, image: event.target.files?.[0] || null }))}
        className="sr-only"
      />
      <Upload className="mx-auto mb-2 h-6 w-6 text-indigo-600" />
      <span className="block text-sm font-semibold text-gray-900">{imageLabel}</span>
      {form.image && (
        <span className="mt-2 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
          Selected: {form.image.name}
        </span>
      )}
    </label>
  </>
);

const EditCandidateModal = ({
  candidate,
  onClose,
  onSaved,
}: {
  candidate: Candidate;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) => {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<CandidateForm>({
    fullName: getCandidateName(candidate),
    studentId: candidate.studentId || '',
    party: candidate.party || '',
    manifesto: candidate.manifesto || candidate.description || '',
    image: null,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!candidate._id) return;
    setIsSaving(true);
    try {
      await electionService.updateCandidate(candidate._id, toFormData(form));
      toast.success('Candidate updated');
      await onSaved();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update candidate'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Edit Candidate</h2>
          <p className="text-sm text-gray-500">Update the candidate details shown on the ballot.</p>
        </div>
        <CandidateFields
          form={form}
          setForm={setForm}
          imageInputRef={imageInputRef}
          imageLabel="Upload replacement photo (leave empty to keep the current one)"
        />
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 font-semibold hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-md bg-button px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? 'Saving...' : 'Save candidate'}
          </button>
        </div>
      </form>
    </div>
  );
};

const ImportSummary = ({ summary }: { summary: CandidateImportSummary }) => (
  <div className="mt-5 rounded-md border border-gray-200 p-4">
    <div className="grid gap-3 text-sm sm:grid-cols-4">
      <SummaryStat label="Rows read" value={summary.rowsRead} />
      <SummaryStat label="Parsed" value={summary.parsedCandidates} />
      <SummaryStat label="Imported" value={summary.importedCandidates} className="text-green-700" />
      <SummaryStat label="Skipped" value={summary.skippedCandidates} className="text-yellow-700" />
    </div>
    {summary.warnings.length > 0 && (
      <div className="mt-4 rounded-md bg-yellow-50 p-3">
        <p className="mb-2 text-sm font-semibold text-yellow-900">Import warnings</p>
        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-yellow-900">
          {summary.warnings.map((warning, index) => (
            <li key={`${warning.rowNumber || 'general'}-${index}`}>
              {warning.rowNumber ? `Row ${warning.rowNumber}: ` : ''}
              {warning.message}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const SummaryStat = ({ label, value, className = 'text-gray-900' }: { label: string; value: number; className?: string }) => (
  <div>
    <p className="text-gray-500">{label}</p>
    <p className={`text-lg font-bold ${className}`}>{value}</p>
  </div>
);

export default CandidatesTab;
