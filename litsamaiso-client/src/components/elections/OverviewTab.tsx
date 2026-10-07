import React from 'react';
import {
  CalendarClock,
  CircleCheck,
  CircleDashed,
  Clock3,
  Eye,
  EyeOff,
  Gauge,
  Globe,
  GraduationCap,
  Info,
  ListChecks,
  TriangleAlert,
  UsersRound,
  Vote,
} from 'lucide-react';
import type { Election, ResultSnapshot, ScheduleReadiness } from '../../types';
import { cn } from '../../lib/utils';
import {
  ballotPositions,
  countBallots,
  formatDate,
  formatRelative,
  getStatus,
  isEditable,
  isVotable,
  type PositionWithCandidates,
} from './electionHelpers';
import { Button, Card, CardHeader, ProgressBar } from './ui';

type OverviewTabProps = {
  election: Election;
  positions: PositionWithCandidates[];
  readiness: ScheduleReadiness | null;
  snapshot: ResultSnapshot | null;
  now: number;
  onGoTo: (tab: 'positions' | 'candidates' | 'results') => void;
  onSchedule: () => void;
};

type StepState = 'done' | 'current' | 'upcoming';

const STAGE_ORDER = ['DRAFT', 'SCHEDULED', 'OPEN', 'COUNTING', 'CLOSED', 'RESULTS_PUBLISHED', 'ARCHIVED'];

const OverviewTab: React.FC<OverviewTabProps> = ({ election, positions, readiness, snapshot, now, onGoTo, onSchedule }) => {
  const status = getStatus(election);
  const stage = STAGE_ORDER.indexOf(status === 'COUNTING' ? 'CLOSED' : status);
  const onBallot = ballotPositions(positions);
  const candidates = positions.flatMap((p) => p.candidates);
  const activeCandidates = candidates.filter(isVotable);
  const ballots = countBallots(snapshot);

  const timeline: Array<{ label: string; detail: string; state: StepState }> = [
    { label: 'Created', detail: formatDate(election.createdAt), state: 'done' },
    {
      label: 'Scheduled',
      detail: stage >= 1 ? 'Visible to students' : 'Not yet',
      state: stage >= 1 ? 'done' : 'current',
    },
    {
      label: 'Voting opens',
      detail: election.startTime ? formatDate(election.startTime) : 'Not set',
      state: stage >= 2 ? 'done' : stage === 1 ? 'current' : 'upcoming',
    },
    {
      label: 'Voting closes',
      detail: election.endTime
        ? `${formatDate(election.endTime)}${status === 'OPEN' ? ` · ${formatRelative(election.endTime, now)}` : ''}`
        : 'Not set',
      state: stage >= 4 ? 'done' : stage === 2 ? 'current' : 'upcoming',
    },
    {
      label: 'Results published',
      detail: stage >= 5 ? 'Visible to students' : status === 'CLOSED' ? 'Awaiting your review' : 'After counting',
      state: stage >= 5 ? 'done' : stage === 4 ? 'current' : 'upcoming',
    },
  ];

  const checklist = readiness && isEditable(election)
    ? [
        {
          label: 'Positions added',
          detail: `${readiness.positionCount} of ${readiness.standardPositionCount} standard`,
          state: readiness.positionCount === 0 ? 'error' : readiness.positionCount < readiness.standardPositionCount ? 'warn' : 'ok',
          tab: 'positions' as const,
        },
        {
          label: 'Approved candidates',
          detail: `${readiness.approvedCandidateCount} total`,
          state: readiness.approvedCandidateCount === 0 ? 'error' : 'ok',
          tab: 'candidates' as const,
        },
        {
          label: 'Every position covered',
          detail: readiness.positionsWithoutCandidates.length
            ? `${readiness.positionsWithoutCandidates.length} without candidates`
            : 'All positions have candidates',
          state: readiness.positionsWithoutCandidates.length ? 'warn' : 'ok',
          tab: 'candidates' as const,
        },
      ]
    : [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader title="Information" icon={Info} />
        <dl className="space-y-4 p-5 text-sm">
          <InfoRow icon={GraduationCap} label="Academic year" value={election.academicYear || '—'} />
          <InfoRow icon={Globe} label="Timezone" value={election.timezone || 'UTC'} />
          <InfoRow
            icon={election.published && status !== 'ARCHIVED' ? Eye : EyeOff}
            label="Students"
            value={election.published && status !== 'ARCHIVED' ? 'Can see it' : 'Hidden'}
          />
          <InfoRow icon={ListChecks} label="Positions" value={`${positions.length}`} />
          <InfoRow icon={UsersRound} label="Candidates" value={`${activeCandidates.length}`} />
          {election.description && (
            <div className="border-t border-slate-100 pt-4 text-slate-600">{election.description}</div>
          )}
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Timeline"
          icon={CalendarClock}
          action={
            isEditable(election) ? (
              <Button size="sm" variant="ghost" onClick={onSchedule}>
                {status === 'SCHEDULED' ? 'Reschedule' : 'Set dates'}
              </Button>
            ) : undefined
          }
        />
        <ol className="p-5">
          {timeline.map((step, index) => (
            <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
              {index < timeline.length - 1 && (
                <span
                  className={cn(
                    'absolute left-[9px] top-6 h-[calc(100%-1.25rem)] w-px',
                    step.state === 'done' ? 'bg-emerald-200' : 'bg-slate-200',
                  )}
                />
              )}
              {step.state === 'done' ? (
                <CircleCheck className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : step.state === 'current' ? (
                <Clock3 className="h-5 w-5 shrink-0 text-active" />
              ) : (
                <CircleDashed className="h-5 w-5 shrink-0 text-slate-300" />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', step.state === 'upcoming' ? 'text-slate-400' : 'text-primary-clr')}>
                  {step.label}
                </p>
                <p className="text-xs text-slate-500">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Vote className="h-4 w-4" />
            On the ballot
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-primary-clr">
            {onBallot.length}
            <span className="text-base font-medium text-slate-400"> / {positions.length} positions</span>
          </p>
          <div className="mt-3">
            <ProgressBar value={positions.length ? (onBallot.length / positions.length) * 100 : 0} />
          </div>
        </Card>

        {snapshot ? (
          <Card className="p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Gauge className="h-4 w-4" />
              Ballots cast
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-primary-clr">{ballots}</p>
            <Button size="sm" variant="ghost" className="-ml-3 mt-2" onClick={() => onGoTo('results')}>
              View results
            </Button>
          </Card>
        ) : null}

        {checklist.length > 0 && (
          <Card>
            <CardHeader title="Ready to schedule?" icon={ListChecks} />
            <ul className="divide-y divide-slate-100">
              {checklist.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => onGoTo(item.tab)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-slate-50"
                  >
                    {item.state === 'ok' ? (
                      <CircleCheck className="h-5 w-5 shrink-0 text-emerald-500" />
                    ) : item.state === 'warn' ? (
                      <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" />
                    ) : (
                      <CircleDashed className="h-5 w-5 shrink-0 text-red-500" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-primary-clr">{item.label}</span>
                      <span className="block text-xs text-slate-500">{item.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
};

const InfoRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) => (
  <div className="flex items-center justify-between gap-4">
    <dt className="flex items-center gap-2 text-slate-500">
      <Icon className="h-4 w-4" />
      {label}
    </dt>
    <dd className="truncate font-medium text-primary-clr">{value}</dd>
  </div>
);

export default OverviewTab;
