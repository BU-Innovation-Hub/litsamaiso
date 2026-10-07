import React, { useState } from 'react';
import { ListChecks, Lock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Election } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import { getPositionTitle, isEditable, isVotable, type PositionWithCandidates } from './electionHelpers';
import { Button, Card, CardHeader, ConfirmModal, EmptyState, IconButton, Pill, inputClass } from './ui';

type PositionsTabProps = {
  election: Election;
  positions: PositionWithCandidates[];
  onChanged: () => Promise<void>;
};

const PositionsTab: React.FC<PositionsTabProps> = ({ election, positions, onChanged }) => {
  const editable = isEditable(election);
  const nextOrder = Math.max(0, ...positions.map((p) => p.displayOrder || 0)) + 1;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<PositionWithCandidates | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdding(true);
    try {
      await electionService.addPosition(election._id, { title, description, displayOrder: nextOrder });
      toast.success(`“${title}” added`, { description: `Position ${nextOrder} on the ballot.` });
      setTitle('');
      setDescription('');
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not add the position'));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting?._id) return;
    setBusy(true);
    try {
      await electionService.deletePosition(deleting._id);
      toast.success(`“${getPositionTitle(deleting)}” removed`);
      setDeleting(null);
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not remove the position'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Ballot positions"
        icon={ListChecks}
        action={
          !editable && (
            <Pill>
              <Lock className="h-3 w-3" />
              Locked
            </Pill>
          )
        }
      />

      {editable && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row">
          <input
            required
            minLength={2}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a position, e.g. Class Representative"
            aria-label="Position title"
            className={inputClass}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            aria-label="Position description"
            className={inputClass}
          />
          <Button type="submit" icon={Plus} loading={adding} className="shrink-0">
            Add
          </Button>
        </form>
      )}

      {positions.length === 0 ? (
        <EmptyState icon={ListChecks} title="No positions yet" description="Add the offices students will vote for." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {positions.map((position) => {
            const count = position.candidates.filter(isVotable).length;
            return (
              <li key={position._id || position.title} className="group flex items-center gap-4 px-5 py-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold tabular-nums text-slate-500">
                  {position.displayOrder}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-primary-clr">{getPositionTitle(position)}</p>
                  {position.description && <p className="truncate text-xs text-slate-500">{position.description}</p>}
                </div>
                <Pill tone={count ? 'green' : 'amber'}>
                  {count ? `${count} candidate${count === 1 ? '' : 's'}` : 'No candidates'}
                </Pill>
                {editable && (
                  <IconButton
                    label={`Remove ${getPositionTitle(position)}`}
                    icon={Trash2}
                    tone="danger"
                    className="opacity-60 group-hover:opacity-100"
                    onClick={() => setDeleting(position)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmModal
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this position?"
        description={
          deleting
            ? `“${getPositionTitle(deleting)}”${
                deleting.candidates.length ? ` and its ${deleting.candidates.length} candidate(s)` : ''
              } will be removed from this election.`
            : undefined
        }
        confirmLabel="Remove"
        tone="danger"
        busy={busy}
        onConfirm={handleDelete}
      />
    </Card>
  );
};

export default PositionsTab;
