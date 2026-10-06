import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Edit, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Election } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import CandidatesTab from './CandidatesTab';
import ConfirmDialog from './ConfirmDialog';
import PositionsTab from './PositionsTab';
import ResultsTab from './ResultsTab';
import ScheduleTab from './ScheduleTab';
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  getStatus,
  hasResults,
  isEditable,
  type PositionWithCandidates,
} from './electionHelpers';

type Tab = 'positions' | 'candidates' | 'schedule' | 'results';

type ElectionDetailProps = {
  election: Election;
  onBack: () => void;
  onElectionChanged: () => Promise<void>;
  onDeleted: () => void;
};

const defaultTab = (election: Election): Tab => {
  if (hasResults(election)) return 'results';
  if (getStatus(election) === 'OPEN') return 'schedule';
  return 'positions';
};

const ElectionDetail: React.FC<ElectionDetailProps> = ({ election, onBack, onElectionChanged, onDeleted }) => {
  const status = getStatus(election);
  const [tab, setTab] = useState<Tab>(defaultTab(election));
  const [positions, setPositions] = useState<PositionWithCandidates[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadPositions = useCallback(async () => {
    try {
      const positionData = await electionService.getPositions(election._id);
      const withCandidates = await Promise.all(
        positionData.map(async (position) => ({
          ...position,
          candidates: position._id ? await electionService.getCandidates(position._id) : [],
        })),
      );
      setPositions(withCandidates);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to load positions'));
    } finally {
      setLoadingPositions(false);
    }
  }, [election._id]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPositions();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadPositions]);

  // A status change (e.g. scheduled -> open -> closed) moves SAAD to the tab that matters next
  const [tabStatus, setTabStatus] = useState(status);
  if (tabStatus !== status) {
    setTabStatus(status);
    setTab(defaultTab(election));
  }

  const refreshAll = async () => {
    await Promise.all([onElectionChanged(), loadPositions()]);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await electionService.deleteElection(election._id);
      toast.success('Election deleted');
      onDeleted();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to delete election'));
      setIsDeleting(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string; visible: boolean }> = [
    { id: 'positions', label: `Positions (${positions.length})`, visible: true },
    {
      id: 'candidates',
      label: `Candidates (${positions.reduce((sum, position) => sum + position.candidates.length, 0)})`,
      visible: true,
    },
    { id: 'schedule', label: 'Schedule', visible: true },
    { id: 'results', label: 'Results', visible: hasResults(election) },
  ];

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        All elections
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-lg bg-white p-6 shadow">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">{election.title}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASSES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {[election.academicYear, election.description].filter(Boolean).join(' · ') || 'No description'}
          </p>
        </div>
        {isEditable(election) && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
            >
              <Edit size={14} />
              Edit details
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200" role="tablist">
        {tabs
          .filter((item) => item.visible)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
                tab === item.id
                  ? 'border-button text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {item.label}
            </button>
          ))}
      </div>

      {loadingPositions ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          {tab === 'positions' && <PositionsTab election={election} positions={positions} onChanged={loadPositions} />}
          {tab === 'candidates' && <CandidatesTab election={election} positions={positions} onChanged={loadPositions} />}
          {tab === 'schedule' && <ScheduleTab key={status} election={election} onChanged={refreshAll} />}
          {tab === 'results' && <ResultsTab key={status} election={election} positions={positions} onChanged={refreshAll} />}
        </>
      )}

      {editing && (
        <EditElectionModal
          election={election}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await onElectionChanged();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete election?"
          confirmLabel="Delete election"
          tone="danger"
          busy={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>
            <strong>{election.title}</strong>, its positions and its candidates will be deleted
            {status === 'SCHEDULED' ? ', and it will no longer open for voting' : ''}.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
};

const EditElectionModal = ({
  election,
  onClose,
  onSaved,
}: {
  election: Election;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) => {
  const [form, setForm] = useState({
    title: election.title || '',
    description: election.description || '',
    academicYear: election.academicYear || '',
    timezone: election.timezone || 'Africa/Gaborone',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await electionService.updateElection(election._id, form);
      toast.success('Election updated');
      await onSaved();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to update election'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-4 rounded-lg bg-white p-6 shadow-xl">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Edit Election</h2>
          <p className="text-sm text-gray-500">Voting times are set on the Schedule tab.</p>
        </div>
        <input
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          placeholder="Election title"
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <textarea
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="Description"
          className="min-h-24 w-full rounded-md border border-gray-300 px-3 py-2"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            value={form.academicYear}
            onChange={(event) => setForm((prev) => ({ ...prev, academicYear: event.target.value }))}
            placeholder="Academic year"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <input
            value={form.timezone}
            onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
            placeholder="Timezone"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
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
            {isSaving ? 'Saving...' : 'Save election'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ElectionDetail;
