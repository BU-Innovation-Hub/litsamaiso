import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Election } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import ConfirmDialog from './ConfirmDialog';
import { getPositionTitle, isEditable, type PositionWithCandidates } from './electionHelpers';

type PositionsTabProps = {
  election: Election;
  positions: PositionWithCandidates[];
  onChanged: () => Promise<void>;
};

const PositionsTab: React.FC<PositionsTabProps> = ({ election, positions, onChanged }) => {
  const editable = isEditable(election);
  const nextDisplayOrder = Math.max(0, ...positions.map((position) => position.displayOrder || 0)) + 1;
  const [form, setForm] = useState({ title: '', description: '', displayOrder: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [deleting, setDeleting] = useState<PositionWithCandidates | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreatePosition = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await electionService.addPosition(election._id, {
        title: form.title,
        description: form.description,
        displayOrder: Number(form.displayOrder) || nextDisplayOrder,
      });
      toast.success('Position created');
      setForm({ title: '', description: '', displayOrder: '' });
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to create position'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePosition = async () => {
    if (!deleting?._id) return;
    setIsDeleting(true);
    try {
      await electionService.deletePosition(deleting._id);
      toast.success('Position deleted');
      setDeleting(null);
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to delete position'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-lg bg-white shadow lg:col-span-2">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Positions ({positions.length})</h2>
          <p className="text-sm text-gray-500">Shown on the ballot in this order. Each position is single-choice.</p>
        </div>
        {positions.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No positions yet.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {positions.map((position) => (
              <li key={position._id || position.title} className="flex items-start justify-between gap-4 px-6 py-4">
                <div>
                  <p className="font-semibold text-gray-900">
                    <span className="mr-2 text-gray-400">{position.displayOrder}.</span>
                    {getPositionTitle(position)}
                  </p>
                  {position.description && <p className="text-sm text-gray-500">{position.description}</p>}
                  <p className="mt-1 text-xs text-gray-400">
                    {position.candidates.length} candidate(s)
                  </p>
                </div>
                {editable && (
                  <button
                    type="button"
                    onClick={() => setDeleting(position)}
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editable && (
        <form className="h-fit space-y-4 rounded-lg bg-white p-6 shadow" onSubmit={handleCreatePosition}>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add Position</h2>
            <p className="text-sm text-gray-500">Positions are the offices students vote for.</p>
          </div>
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Position title"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <textarea
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
            className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-gray-700">Display order</span>
            <input
              type="number"
              min={1}
              value={form.displayOrder}
              placeholder={String(nextDisplayOrder)}
              onChange={(event) => setForm((prev) => ({ ...prev, displayOrder: event.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <span className="block text-xs text-gray-500">Where this position appears on the ballot.</span>
          </label>
          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-md bg-button py-2 font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? 'Adding...' : 'Add Position'}
          </button>
        </form>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete position?"
          confirmLabel="Delete position"
          tone="danger"
          busy={isDeleting}
          onConfirm={handleDeletePosition}
          onCancel={() => setDeleting(null)}
        >
          <p>
            <strong>{getPositionTitle(deleting)}</strong> and its {deleting.candidates.length} candidate(s) will be removed
            from this election.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
};

export default PositionsTab;
