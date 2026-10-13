import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Send,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Election, ResultSnapshot, ScheduleReadiness } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import { cn } from '../../lib/utils';
import CandidatesTab from './CandidatesTab';
import OverviewTab from './OverviewTab';
import PositionsTab from './PositionsTab';
import ResultsTab from './ResultsTab';
import { exportResultsPdf } from './resultsPdf';
import {
  formatDuration,
  formatRelative,
  fromDateTimeLocalValue,
  getStatus,
  hasResults,
  isEditable,
  toDateTimeLocalValue,
  useNow,
  type PositionWithCandidates,
} from './electionHelpers';
import { Button, ConfirmModal, Field, IconButton, Modal, Skeleton, StatusPill, ToggleRow, inputClass } from './ui';

type Tab = 'overview' | 'positions' | 'candidates' | 'results';
type Dialog = 'schedule' | 'extend' | 'close' | 'publish' | 'archive' | 'edit' | 'delete' | null;

type ElectionDetailProps = {
  election: Election;
  onBack: () => void;
  onElectionChanged: () => Promise<void>;
  onDeleted: () => void;
};

const defaultTab = (election: Election): Tab => (hasResults(election) ? 'results' : 'overview');

const ElectionDetail: React.FC<ElectionDetailProps> = ({ election, onBack, onElectionChanged, onDeleted }) => {
  const status = getStatus(election);
  const now = useNow(30_000);
  const [tab, setTab] = useState<Tab>(defaultTab(election));
  const [positions, setPositions] = useState<PositionWithCandidates[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [snapshot, setSnapshot] = useState<ResultSnapshot | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [readiness, setReadiness] = useState<ScheduleReadiness | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  // Moving to a new stage (e.g. open -> closed) lands SAAD on the tab that matters next
  const [tabStatus, setTabStatus] = useState(status);
  if (tabStatus !== status) {
    setTabStatus(status);
    setTab(defaultTab(election));
  }

  const loadPositions = useCallback(async () => {
    try {
      const data = await electionService.getPositions(election._id);
      const withCandidates = await Promise.all(
        data.map(async (position) => ({
          ...position,
          candidates: position._id ? await electionService.getCandidates(position._id) : [],
        })),
      );
      setPositions(withCandidates);
      if (isEditable(election)) {
        setReadiness(await electionService.getScheduleReadiness(election._id));
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not load positions'));
    } finally {
      setLoadingPositions(false);
    }
  }, [election]);

  const loadResults = useCallback(async () => {
    if (!hasResults(election) || status === 'COUNTING') return;
    setLoadingResults(true);
    try {
      setSnapshot(await electionService.getResults(election._id));
    } catch {
      // A closed election without a snapshot (e.g. the count job failed) is counted on demand
      if (status === 'CLOSED') {
        try {
          setSnapshot(await electionService.recomputeResults(election._id));
        } catch (error: unknown) {
          toast.error(getApiErrorMessage(error, 'Could not count the results'));
        }
      }
    } finally {
      setLoadingResults(false);
    }
  }, [election, status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPositions();
      void loadResults();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadPositions, loadResults]);

  // Counting takes a few seconds; keep checking until it's done
  useEffect(() => {
    if (status !== 'COUNTING') return;
    const id = window.setInterval(() => void onElectionChanged(), 3000);
    return () => window.clearInterval(id);
  }, [status, onElectionChanged]);

  const run = async (action: () => Promise<unknown>, success: string, failure: string, description?: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success, description ? { description } : undefined);
      setDialog(null);
      await onElectionChanged();
      return true;
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await electionService.deleteElection(election._id);
      toast.success(`“${election.title}” deleted`);
      onDeleted();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not delete the election'));
      setBusy(false);
    }
  };

  const totalCandidates = positions.reduce((sum, p) => sum + p.candidates.length, 0);
  const tabs: Array<{ id: Tab; label: string; count?: number; visible: boolean }> = [
    { id: 'overview', label: 'Overview', visible: true },
    { id: 'positions', label: 'Positions', count: positions.length, visible: true },
    { id: 'candidates', label: 'Candidates', count: totalCandidates, visible: true },
    { id: 'results', label: 'Results', visible: hasResults(election) },
  ];

  const subline = (() => {
    if (status === 'DRAFT') return 'Not visible to students';
    if (status === 'SCHEDULED') return `Opens ${formatRelative(election.startTime, now)}`;
    if (status === 'OPEN') return `Voting open · closes ${formatRelative(election.endTime, now)}`;
    if (status === 'COUNTING') return 'Counting votes…';
    if (status === 'CLOSED') return 'Voting ended · results not yet published';
    if (status === 'RESULTS_PUBLISHED') return 'Results visible to students';
    return 'Archived · hidden from students';
  })();

  const primaryActions = (
    <div className="flex flex-wrap items-center gap-2">
      {isEditable(election) && (
        <>
          <IconButton label="Edit details" icon={Pencil} onClick={() => setDialog('edit')} />
          <IconButton label="Delete election" icon={Trash2} tone="danger" onClick={() => setDialog('delete')} />
          <Button icon={CalendarClock} onClick={() => setDialog('schedule')}>
            {status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
          </Button>
        </>
      )}
      {status === 'OPEN' && (
        <>
          <Button variant="secondary" icon={CalendarPlus} onClick={() => setDialog('extend')}>
            Extend
          </Button>
          <Button variant="danger" icon={Lock} onClick={() => setDialog('close')}>
            Close voting
          </Button>
        </>
      )}
      {status === 'COUNTING' && (
        <span className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Counting
        </span>
      )}
      {(status === 'CLOSED' || status === 'RESULTS_PUBLISHED' || status === 'ARCHIVED') && snapshot && (
        <IconButton
          label="Export results PDF"
          icon={Download}
          onClick={() => {
            exportResultsPdf(election, snapshot, positions);
            toast.success('Results PDF downloaded');
          }}
        />
      )}
      {(status === 'CLOSED' || status === 'RESULTS_PUBLISHED') && (
        <Button variant="secondary" icon={Archive} onClick={() => setDialog('archive')}>
          Archive
        </Button>
      )}
      {status === 'CLOSED' && (
        <Button icon={Send} disabled={!snapshot} onClick={() => setDialog('publish')}>
          Publish results
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500" aria-label="Breadcrumb">
        <button type="button" onClick={onBack} className="font-medium hover:text-primary-clr">
          Elections
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate font-medium text-primary-clr">{election.title}</span>
      </nav>

      <div className="rounded-3xl border border-white/70 bg-white/90 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold text-primary-clr">{election.title}</h1>
              <StatusPill status={status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {[election.academicYear, subline].filter(Boolean).join(' · ')}
            </p>
          </div>
          {primaryActions}
        </div>

        <div className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3" role="tablist">
          {tabs
            .filter((t) => t.visible)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition',
                  tab === t.id ? 'border-active text-active' : 'border-transparent text-slate-500 hover:text-primary-clr',
                )}
              >
                {t.label}
                {t.count !== undefined && !loadingPositions && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs tabular-nums',
                      tab === t.id ? 'bg-active/10 text-active' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
        </div>
      </div>

      {loadingPositions ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div key={tab} className="animate-rise-in">
          {tab === 'overview' && (
            <OverviewTab
              election={election}
              positions={positions}
              readiness={readiness}
              snapshot={snapshot}
              now={now}
              onGoTo={setTab}
              onSchedule={() => setDialog('schedule')}
            />
          )}
          {tab === 'positions' && <PositionsTab election={election} positions={positions} onChanged={loadPositions} />}
          {tab === 'candidates' && <CandidatesTab election={election} positions={positions} onChanged={loadPositions} />}
          {tab === 'results' && (
            <ResultsTab election={election} positions={positions} snapshot={snapshot} loading={loadingResults} />
          )}
        </div>
      )}

      {dialog === 'schedule' && <ScheduleModal
        open
        onOpenChange={(open) => setDialog(open ? 'schedule' : null)}
        election={election}
        readiness={readiness}
        busy={busy}
        onGoTo={(t) => {
          setDialog(null);
          setTab(t);
        }}
        onSubmit={(payload) =>
          run(
            () => electionService.scheduleElection(election._id, payload),
            status === 'SCHEDULED' ? 'Schedule updated' : 'Election scheduled',
            'Could not schedule the election',
            'Students can now see it.',
          )
        }
      />}

      {dialog === 'extend' && <ExtendModal
        open
        onOpenChange={(open) => setDialog(open ? 'extend' : null)}
        election={election}
        busy={busy}
        onSubmit={(endTime) =>
          run(
            () => electionService.extendElection(election._id, endTime),
            'Voting extended',
            'Could not extend voting',
            `Now closes ${new Date(endTime).toLocaleString()}.`,
          )
        }
      />}

      <ConfirmModal
        open={dialog === 'close'}
        onOpenChange={(open) => setDialog(open ? 'close' : null)}
        title="Close voting now?"
        description="Students can no longer vote and counting starts immediately. This can't be undone."
        confirmLabel="Close voting"
        tone="danger"
        busy={busy}
        onConfirm={() =>
          run(() => electionService.closeElection(election._id), 'Voting closed', 'Could not close voting', 'Counting has started.')
        }
      />

      <ConfirmModal
        open={dialog === 'publish'}
        onOpenChange={(open) => setDialog(open ? 'publish' : null)}
        title="Publish results?"
        description="Every student will see these results. Published results are final and can't be recounted."
        confirmLabel="Publish results"
        busy={busy}
        onConfirm={() =>
          run(() => electionService.publishResults(election._id), 'Results published', 'Could not publish results', 'Students can now see them.')
        }
      >
        {snapshot?.positions.some((p) => p.outcome === 'TIE') && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Some positions ended in a tie and will be published without a winner.
          </p>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={dialog === 'archive'}
        onOpenChange={(open) => setDialog(open ? 'archive' : null)}
        title="Archive this election?"
        description="It will be hidden from students but stays here as a record."
        confirmLabel="Archive"
        busy={busy}
        onConfirm={() => run(() => electionService.archiveElection(election._id), 'Election archived', 'Could not archive the election')}
      />

      <ConfirmModal
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        title="Delete this election?"
        description={`“${election.title}”, its positions and candidates will be removed${
          status === 'SCHEDULED' ? ' and it will not open for voting' : ''
        }.`}
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onConfirm={handleDelete}
      />

      {dialog === 'edit' && <EditElectionModal
        open
        onOpenChange={(open) => setDialog(open ? 'edit' : null)}
        election={election}
        busy={busy}
        onSubmit={(form) =>
          run(
            () => electionService.updateElection(election._id, form),
            'Details saved',
            'Could not save details',
            form.notifyStudents !== (election.notifyStudents !== false)
              ? `Student emails turned ${form.notifyStudents ? 'on' : 'off'}.`
              : undefined,
          )
        }
      />}
    </div>
  );
};

const ScheduleModal = ({
  open,
  onOpenChange,
  election,
  readiness,
  busy,
  onGoTo,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  election: Election;
  readiness: ScheduleReadiness | null;
  busy: boolean;
  onGoTo: (tab: Tab) => void;
  onSubmit: (payload: { startTime: string; endTime: string; timezone: string }) => Promise<boolean>;
}) => {
  const [form, setForm] = useState({
    startTime: toDateTimeLocalValue(election.startTime),
    endTime: toDateTimeLocalValue(election.endTime),
    timezone: election.timezone || 'Africa/Gaborone',
  });

  const now = useNow(15_000);
  const start = form.startTime ? new Date(form.startTime).getTime() : null;
  const end = form.endTime ? new Date(form.endTime).getTime() : null;
  const timeError =
    start && end && end <= start ? 'Voting must close after it opens.' : end && end <= now ? 'Closing time is in the past.' : '';

  const blockers = readiness?.blockers || [];
  const warnings: string[] = [];
  if (readiness && readiness.positionCount < readiness.standardPositionCount) {
    warnings.push(`${readiness.positionCount} of ${readiness.standardPositionCount} standard positions`);
  }
  if (readiness?.positionsWithoutCandidates.length) {
    const empty = readiness.positionsWithoutCandidates;
    const names = empty.slice(0, 3).join(', ') + (empty.length > 3 ? ` +${empty.length - 3} more` : '');
    warnings.push(`${empty.length} position${empty.length === 1 ? '' : 's'} without candidates won't be on the ballot (${names})`);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (timeError || blockers.length) return;
    await onSubmit({
      startTime: fromDateTimeLocalValue(form.startTime),
      endTime: fromDateTimeLocalValue(form.endTime),
      timezone: form.timezone,
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={getStatus(election) === 'SCHEDULED' ? 'Reschedule voting' : 'Schedule voting'}
      description="Voting opens and closes automatically."
    >
      <form id="schedule-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Opens">
            <input
              type="datetime-local"
              required
              value={form.startTime}
              onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Closes">
            <input
              type="datetime-local"
              required
              value={form.endTime}
              onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Timezone">
          <input
            required
            value={form.timezone}
            onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
            className={inputClass}
          />
        </Field>

        {timeError ? (
          <p className="text-sm font-medium text-red-600">{timeError}</p>
        ) : start && end ? (
          <p className="text-sm text-slate-500">
            Voting runs for <span className="font-semibold text-primary-clr">{formatDuration(end - start)}</span>
            {start <= now && ' and opens immediately'}.
          </p>
        ) : null}

        {blockers.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">Not ready to schedule</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => onGoTo('positions')}>
                Positions
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onGoTo('candidates')}>
                Candidates
              </Button>
            </div>
          </div>
        )}

        {!blockers.length && warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="flex items-center gap-2 font-semibold">
              <TriangleAlert className="h-4 w-4" />
              Check before scheduling
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </form>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
          {warnings.length && !blockers.length ? 'Go back and fix' : 'Cancel'}
        </Button>
        <Button type="submit" form="schedule-form" loading={busy} disabled={Boolean(timeError) || blockers.length > 0}>
          {warnings.length ? 'Schedule anyway' : 'Schedule'}
        </Button>
      </div>
    </Modal>
  );
};

const ExtendModal = ({
  open,
  onOpenChange,
  election,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  election: Election;
  busy: boolean;
  onSubmit: (endTime: string) => Promise<boolean>;
}) => {
  const [endTime, setEndTime] = useState(toDateTimeLocalValue(election.endTime));
  const tooEarly = election.endTime && endTime && new Date(endTime) <= new Date(election.endTime);

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Extend voting"
      description={election.endTime ? `Currently closes ${new Date(election.endTime).toLocaleString()}.` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!endTime || Boolean(tooEarly)} onClick={() => void onSubmit(fromDateTimeLocalValue(endTime))}>
            Extend
          </Button>
        </>
      }
    >
      <Field label="New closing time">
        <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
      </Field>
      {tooEarly && <p className="mt-2 text-sm font-medium text-red-600">Pick a time after the current closing time.</p>}
    </Modal>
  );
};

const EditElectionModal = ({
  open,
  onOpenChange,
  election,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  election: Election;
  busy: boolean;
  onSubmit: (form: {
    title: string;
    description: string;
    academicYear: string;
    timezone: string;
    notifyStudents: boolean;
  }) => Promise<boolean>;
}) => {
  const [form, setForm] = useState({
    title: election.title || '',
    description: election.description || '',
    academicYear: election.academicYear || '',
    timezone: election.timezone || 'Africa/Gaborone',
    notifyStudents: election.notifyStudents !== false,
  });

  return (
    <Modal open={open} onOpenChange={(next) => !busy && onOpenChange(next)} title="Edit details">
      <form
        id="edit-election"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(form);
        }}
        className="space-y-4"
      >
        <Field label="Title">
          <input
            required
            minLength={3}
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Academic year">
            <input
              value={form.academicYear}
              onChange={(e) => setForm((p) => ({ ...p, academicYear: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Timezone">
            <input value={form.timezone} onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))} className={inputClass} />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <ToggleRow
          icon={Mail}
          label="Email students"
          description="When voting opens, before it closes, when it closes and when results are out."
          checked={form.notifyStudents}
          onChange={(notifyStudents) => setForm((p) => ({ ...p, notifyStudents }))}
        />
      </form>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" form="edit-election" loading={busy}>
          Save
        </Button>
      </div>
    </Modal>
  );
};

export default ElectionDetail;
