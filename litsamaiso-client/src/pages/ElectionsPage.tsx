import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, CalendarClock, Check, CircleCheck, Copy, Hourglass, Inbox, Vote } from 'lucide-react';
import { toast } from 'sonner';
import PositionStandings from '../components/elections/PositionStandings';
import { formatDate, formatRelative, useNow } from '../components/elections/electionHelpers';
import { Button, Card, EmptyState, Modal, Skeleton, StatusPill } from '../components/elections/ui';
import { electionService } from '../services/electionService';
import type { Election, ResultPositionDetail } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

type VoteStatus = { hasVoted: boolean; receiptId?: string; submittedAt?: string };

// Longest wait before re-checking, and a small grace after an open/close time
const MAX_REFRESH_DELAY_MS = 60 * 60 * 1000;
const REFRESH_GRACE_MS = 3000;

// Next moment an election's status will change: a scheduled start or an open election's end
const getNextBoundary = (elections: Election[]) => {
  const times = elections.flatMap((election) => {
    if (election.status === 'SCHEDULED' && election.startTime) return [new Date(election.startTime).getTime()];
    if (election.status === 'OPEN' && election.endTime) return [new Date(election.endTime).getTime()];
    return [];
  });
  return times.length > 0 ? Math.min(...times) : null;
};

const ReceiptChip = ({ receiptId, submittedAt }: { receiptId: string; submittedAt?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(receiptId);
      setCopied(true);
      toast.success('Receipt copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the receipt');
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
          <CircleCheck className="h-4 w-4" />
          You voted{submittedAt ? ` · ${formatDate(submittedAt)}` : ''}
        </p>
        <p className="truncate font-mono text-xs text-emerald-700/80">Receipt {receiptId}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy receipt"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-700 transition hover:bg-emerald-100"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
};

const ElectionsPage: React.FC = () => {
  const location = useLocation();
  const [elections, setElections] = useState<Election[]>([]);
  const [voteStatuses, setVoteStatuses] = useState<Record<string, VoteStatus>>({});
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [resultsElection, setResultsElection] = useState<Election | null>(null);
  const [resultPositions, setResultPositions] = useState<ResultPositionDetail[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const now = useNow(30_000, clockOffsetMs);
  const notice = (location.state as { electionCompletedMessage?: string } | null)?.electionCompletedMessage;

  const loadElections = useCallback(async () => {
    try {
      const { elections: data, serverTime } = await electionService.getElectionsWithServerTime();
      setElections(data);
      if (serverTime) setClockOffsetMs(new Date(serverTime).getTime() - Date.now());

      const entries = await Promise.all(
        data.map(async (election) => {
          try {
            return [election._id, await electionService.getVoteStatus(election._id)] as const;
          } catch {
            return [election._id, { hasVoted: false }] as const;
          }
        }),
      );
      setVoteStatuses(Object.fromEntries(entries));
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not load elections'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadElections();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadElections]);

  // Refetch just after the next open/close time so cards change without a manual refresh
  useEffect(() => {
    const boundary = getNextBoundary(elections);
    if (boundary === null) return;
    const serverNow = Date.now() + clockOffsetMs;
    const delay = Math.min(Math.max(boundary - serverNow, 0) + REFRESH_GRACE_MS, MAX_REFRESH_DELAY_MS);
    const timeout = window.setTimeout(() => void loadElections(), delay);
    return () => window.clearTimeout(timeout);
  }, [elections, clockOffsetMs, loadElections]);

  const handleViewResults = async (election: Election) => {
    setResultsElection(election);
    setResultPositions([]);
    setIsLoadingResults(true);
    try {
      const snapshot = await electionService.getResults(election._id);
      setResultPositions(
        await Promise.all(
          snapshot.positions.map((p) => electionService.getResultsByPosition(election._id, String(p.positionId))),
        ),
      );
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Could not load results'));
      setResultsElection(null);
    } finally {
      setIsLoadingResults(false);
    }
  };

  const open = elections.filter((e) => e.status === 'OPEN');
  const upcoming = elections.filter((e) => e.status === 'SCHEDULED');
  const completed = elections.filter((e) => ['CLOSED', 'COUNTING', 'RESULTS_PUBLISHED'].includes(e.status || ''));

  const renderCard = (election: Election) => {
    const voteStatus = voteStatuses[election._id];
    const status = election.status || 'SCHEDULED';
    return (
      <Card key={election._id} className="animate-rise-in flex flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <StatusPill
            status={status}
            label={status === 'CLOSED' || status === 'COUNTING' ? 'Being reviewed' : status === 'SCHEDULED' ? 'Upcoming' : undefined}
          />
          {election.academicYear && <span className="text-xs font-medium text-slate-400">{election.academicYear}</span>}
        </div>
        <h3 className="mt-3 text-lg font-semibold text-primary-clr">{election.title}</h3>
        {election.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{election.description}</p>}

        <p className="mt-4 flex items-center gap-1.5 text-sm text-slate-500">
          {status === 'OPEN' ? (
            <>
              <Hourglass className="h-4 w-4 text-emerald-600" />
              <span>
                Closes <span className="font-semibold text-emerald-700">{formatRelative(election.endTime, now)}</span>
              </span>
            </>
          ) : status === 'SCHEDULED' ? (
            <>
              <CalendarClock className="h-4 w-4 text-active" />
              <span>
                Opens <span className="font-semibold text-active">{formatRelative(election.startTime, now)}</span>
                <span className="text-slate-400"> · {formatDate(election.startTime)}</span>
              </span>
            </>
          ) : (
            <>
              <CalendarClock className="h-4 w-4" />
              Ended {formatDate(election.endTime)}
            </>
          )}
        </p>

        <div className="mt-5 space-y-3 pt-1">
          {voteStatus?.hasVoted && voteStatus.receiptId && (
            <ReceiptChip receiptId={voteStatus.receiptId} submittedAt={voteStatus.submittedAt} />
          )}
          {status === 'OPEN' && !voteStatus?.hasVoted && (
            <Link
              to={`/elections/${election._id}/vote`}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-button font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:bg-primary-clr active:scale-[0.99]"
            >
              <Vote className="h-4 w-4" />
              Vote now
            </Link>
          )}
          {status === 'RESULTS_PUBLISHED' && (
            <Button variant="secondary" icon={BarChart3} className="w-full" onClick={() => void handleViewResults(election)}>
              View results
            </Button>
          )}
          {(status === 'CLOSED' || status === 'COUNTING') && (
            <p className="rounded-2xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">Results will appear here once published.</p>
          )}
        </div>
      </Card>
    );
  };

  const section = (title: string, items: Election[]) =>
    items.length > 0 && (
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
          <span className="rounded-full bg-white/80 px-2 text-xs tabular-nums">{items.length}</span>
        </h2>
        <div className="grid gap-4 md:grid-cols-2">{items.map(renderCard)}</div>
      </section>
    );

  return (
    <div className="global-bg min-h-screen pt-36">
      <div className="mx-auto max-w-4xl space-y-8 px-4 pb-16">
        <header>
          <h1 className="text-3xl font-bold text-primary-clr">Elections</h1>
          {notice && (
            <p className="animate-rise-in mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <CircleCheck className="h-4 w-4" />
              {notice}
            </p>
          )}
        </header>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        ) : elections.length === 0 ? (
          <Card>
            <EmptyState icon={Inbox} title="No elections right now" description="When an election is scheduled, it shows up here." />
          </Card>
        ) : (
          <>
            {section('Open now', open)}
            {section('Upcoming', upcoming)}
            {section('Completed', completed)}
          </>
        )}
      </div>

      <Modal
        open={Boolean(resultsElection)}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setResultsElection(null);
            setResultPositions([]);
          }
        }}
        title="Results"
        description={resultsElection?.title}
        size="lg"
      >
        {isLoadingResults ? (
          <div className="space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : resultPositions.length === 0 ? (
          <EmptyState icon={BarChart3} title="No results available" className="py-6" />
        ) : (
          <div className="space-y-4">
            {resultPositions.filter((position) => position.rankings.length > 0).map((position) => (
              <PositionStandings
                key={position.positionId}
                title={position.positionTitle || 'Position'}
                outcome={position.outcome || (position.winnerId ? 'WINNER' : 'NO_VOTES')}
                standings={position.rankings.map((r) => ({
                  candidateId: r.candidateId,
                  name: r.candidateName || 'Candidate',
                  votes: r.votes,
                  percentage: r.percentage,
                  rank: r.rank,
                  isWinner: Boolean(position.winnerId) && position.winnerId === r.candidateId,
                }))}
              />
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ElectionsPage;
