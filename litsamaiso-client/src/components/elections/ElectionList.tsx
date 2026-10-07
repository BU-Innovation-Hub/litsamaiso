import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronRight, Download, ListChecks, Mail, Plus, Search, Vote } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Election, Position } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import { cn } from '../../lib/utils';
import { formatDate, formatRelative, getStatus, useNow, type ElectionStatus } from './electionHelpers';
import { Button, Card, EmptyState, Field, Modal, Pill, Skeleton, StatusPill, ToggleRow, inputClass } from './ui';

type ElectionListProps = {
  elections: Election[];
  loading: boolean;
  onCreated: (election: Election) => void;
  onOpen: (electionId: string) => void;
};

type Filter = 'ALL' | 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'RESULTS_PUBLISHED' | 'ARCHIVED';

const FILTERS: Array<{ id: Filter; label: string; matches: ElectionStatus[] }> = [
  { id: 'ALL', label: 'All', matches: [] },
  { id: 'OPEN', label: 'Open', matches: ['OPEN'] },
  { id: 'SCHEDULED', label: 'Scheduled', matches: ['SCHEDULED'] },
  { id: 'DRAFT', label: 'Drafts', matches: ['DRAFT'] },
  { id: 'CLOSED', label: 'Awaiting results', matches: ['CLOSED', 'COUNTING'] },
  { id: 'RESULTS_PUBLISHED', label: 'Published', matches: ['RESULTS_PUBLISHED'] },
  { id: 'ARCHIVED', label: 'Archived', matches: ['ARCHIVED'] },
];

const timingLine = (election: Election, now: number) => {
  const status = getStatus(election);
  if (status === 'DRAFT') return 'Not scheduled yet';
  if (status === 'SCHEDULED') return `Opens ${formatRelative(election.startTime, now)}`;
  if (status === 'OPEN') return `Closes ${formatRelative(election.endTime, now)}`;
  if (status === 'COUNTING') return 'Counting votes…';
  if (status === 'CLOSED') return 'Ready to review and publish';
  return `Ended ${formatDate(election.endTime)}`;
};

const ElectionList: React.FC<ElectionListProps> = ({ elections, loading, onCreated, onOpen }) => {
  const now = useNow(30_000);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [standardPositions, setStandardPositions] = useState<Position[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [positionsOpen, setPositionsOpen] = useState(false);

  useEffect(() => {
    electionService
      .getPositionTemplates()
      .then(setStandardPositions)
      .catch((error: unknown) => toast.error(getApiErrorMessage(error, 'Could not load standard positions')));
  }, []);

  const counts = useMemo(() => {
    const byFilter: Record<Filter, number> = {
      ALL: elections.length, DRAFT: 0, SCHEDULED: 0, OPEN: 0, CLOSED: 0, RESULTS_PUBLISHED: 0, ARCHIVED: 0,
    };
    for (const election of elections) {
      const match = FILTERS.find((f) => f.matches.includes(getStatus(election)));
      if (match) byFilter[match.id] += 1;
    }
    return byFilter;
  }, [elections]);

  const visible = useMemo(() => {
    const active = FILTERS.find((f) => f.id === filter)!;
    const q = query.trim().toLowerCase();
    return elections.filter(
      (election) =>
        (filter === 'ALL' || active.matches.includes(getStatus(election))) &&
        (!q || `${election.title} ${election.academicYear || ''}`.toLowerCase().includes(q)),
    );
  }, [elections, filter, query]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-3xl font-bold text-primary-clr">Elections</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={ListChecks} onClick={() => setPositionsOpen(true)}>
            Standard positions
            <Pill tone={standardPositions.length ? 'indigo' : 'amber'}>{standardPositions.length}</Pill>
          </Button>
          <Button icon={Plus} onClick={() => setCreateOpen(true)}>
            New election
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Open now', value: counts.OPEN, accent: 'bg-emerald-500' },
          { label: 'Scheduled', value: counts.SCHEDULED, accent: 'bg-active' },
          { label: 'Drafts', value: counts.DRAFT, accent: 'bg-stroke-clr' },
          { label: 'Awaiting results', value: counts.CLOSED, accent: 'bg-amber-500' },
        ].map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden p-4">
            <span className={cn('absolute inset-y-4 left-0 w-1 rounded-r-full', stat.accent)} />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-primary-clr">{loading ? '–' : stat.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter elections">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition',
                  filter === f.id ? 'bg-button text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-primary-clr',
                )}
              >
                {f.label}
                <span className={cn('text-xs tabular-nums', filter === f.id ? 'text-white/60' : 'text-slate-400')}>
                  {counts[f.id]}
                </span>
              </button>
            ))}
          </div>
          <div className="relative lg:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search elections"
              aria-label="Search elections"
              className={cn(inputClass, 'py-2 pl-9')}
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : elections.length === 0 ? (
          <EmptyState
            icon={Vote}
            title="No elections yet"
            description="Create your first election. It starts with your standard positions."
            action={<Button icon={Plus} onClick={() => setCreateOpen(true)}>New election</Button>}
          />
        ) : visible.length === 0 ? (
          <EmptyState icon={Search} title="Nothing matches" description="Try another filter or search term." />
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((election) => {
              const status = getStatus(election);
              return (
                <button
                  key={election._id}
                  type="button"
                  onClick={() => onOpen(election._id)}
                  className="group animate-rise-in flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-active/40 hover:shadow-lg hover:shadow-slate-900/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <StatusPill status={status} />
                    <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-active" />
                  </div>
                  <h3 className="mt-3 line-clamp-2 font-semibold text-primary-clr">{election.title}</h3>
                  <p className="text-sm text-slate-500">{election.academicYear || 'No academic year'}</p>
                  <p
                    className={cn(
                      'mt-4 flex items-center gap-1.5 text-xs font-medium',
                      status === 'OPEN' ? 'text-emerald-700' : status === 'CLOSED' ? 'text-amber-700' : 'text-slate-500',
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {timingLine(election, now)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <CreateElectionModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        standardCount={standardPositions.length}
        onOpenStandard={() => {
          setCreateOpen(false);
          setPositionsOpen(true);
        }}
        onCreated={(election) => {
          setCreateOpen(false);
          onCreated(election);
        }}
      />
      <StandardPositionsModal
        open={positionsOpen}
        onOpenChange={setPositionsOpen}
        positions={standardPositions}
        onImported={setStandardPositions}
      />
    </div>
  );
};

const emptyForm = { title: '', academicYear: '', description: '', timezone: 'Africa/Gaborone', notifyStudents: true };

const CreateElectionModal = ({
  open,
  onOpenChange,
  standardCount,
  onOpenStandard,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standardCount: number;
  onOpenStandard: () => void;
  onCreated: (election: Election) => void;
}) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const election = await electionService.createElection(form);
      toast.success(`“${election.title}” created`, {
        description: standardCount ? `${standardCount} standard positions added.` : 'Add positions to get started.',
      });
      setForm(emptyForm);
      onCreated(election);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not create the election'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => !saving && onOpenChange(next)} title="New election">
      <form id="create-election" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Title">
          <input
            autoFocus
            required
            minLength={3}
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. SRC Elections 2026"
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Academic year">
            <input
              value={form.academicYear}
              onChange={(e) => setForm((p) => ({ ...p, academicYear: e.target.value }))}
              placeholder="2026/2027"
              className={inputClass}
            />
          </Field>
          <Field label="Timezone">
            <input
              value={form.timezone}
              onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Optional"
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
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-2xl p-3 text-sm',
            standardCount ? 'bg-active/5 text-active' : 'bg-amber-50 text-amber-800',
          )}
        >
          <span className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            {standardCount ? `Starts with ${standardCount} standard positions` : 'No standard positions imported'}
          </span>
          {!standardCount && (
            <button type="button" onClick={onOpenStandard} className="font-semibold underline-offset-2 hover:underline">
              Import
            </button>
          )}
        </div>
      </form>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="create-election" loading={saving}>
          Create election
        </Button>
      </div>
    </Modal>
  );
};

const StandardPositionsModal = ({
  open,
  onOpenChange,
  positions,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positions: Position[];
  onImported: (positions: Position[]) => void;
}) => {
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      const { created, templates } = await electionService.importSrcPositionTemplates();
      onImported(templates);
      if (created > 0) {
        toast.success(`${created} SRC position${created === 1 ? '' : 's'} imported`, {
          description: 'New elections will start with them.',
        });
      } else {
        toast.info('Already up to date', { description: 'All SRC positions are in your standard list.' });
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not import SRC positions'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Standard positions"
      description="Copied onto every new election."
      footer={
        <Button icon={Download} loading={importing} onClick={handleImport}>
          {positions.length ? 'Sync SRC positions' : 'Import SRC positions'}
        </Button>
      }
    >
      {positions.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No standard positions"
          description="Import the 12 SRC positions to use them on new elections."
          className="py-6"
        />
      ) : (
        <ol className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {positions.map((position, index) => (
            <li key={position._id || position.title} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-5 text-right text-xs font-semibold tabular-nums text-slate-400">{index + 1}</span>
              <span className="font-medium text-primary-clr">{position.title}</span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
};

export default ElectionList;
