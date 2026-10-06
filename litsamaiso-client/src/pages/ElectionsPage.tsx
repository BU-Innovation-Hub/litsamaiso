import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, CheckCircle, Copy, Eye, Loader, Vote } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../services/electionService';
import type { Election, ResultPositionDetail, VoteReceipt } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

type VoteStatus = { hasVoted: boolean; receiptId?: string; submittedAt?: string };

// Longest wait before re-checking, and the setTimeout ceiling (~24.8 days)
const MAX_REFRESH_DELAY_MS = 60 * 60 * 1000;
const REFRESH_GRACE_MS = 3000;

// The server keeps each election's status current; the page only reflects it
const getBallotState = (election: Election) => {
  switch (election.status) {
    case 'OPEN':
      return { kind: 'open' as const, message: 'Ballot is open' };
    case 'SCHEDULED':
      return {
        kind: 'upcoming' as const,
        message: election.startTime
          ? `Ballot opens ${new Date(election.startTime).toLocaleString()}`
          : 'Ballot is not open yet',
      };
    case 'RESULTS_PUBLISHED':
      return { kind: 'results' as const, message: 'Results published' };
    case 'CLOSED':
    case 'COUNTING':
      return { kind: 'reviewing' as const, message: 'Results are being reviewed' };
    default:
      return { kind: 'upcoming' as const, message: 'Ballot is not open yet' };
  }
};

// Next moment an election's status will change: a scheduled start or an open election's end
const getNextBoundary = (elections: Election[]) => {
  const times = elections.flatMap((election) => {
    if (election.status === 'SCHEDULED' && election.startTime) return [new Date(election.startTime).getTime()];
    if (election.status === 'OPEN' && election.endTime) return [new Date(election.endTime).getTime()];
    return [];
  });
  return times.length > 0 ? Math.min(...times) : null;
};

const copyToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success('Receipt copied');
  } catch {
    toast.error('Could not copy the receipt');
  }
};

const ReceiptLine = ({ receiptId, submittedAt }: { receiptId: string; submittedAt?: string }) => (
  <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    {submittedAt && <span>Voted {new Date(submittedAt).toLocaleString()}</span>}
    <span>· Receipt</span>
    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">{receiptId}</code>
    <button
      type="button"
      onClick={() => void copyToClipboard(receiptId)}
      className="inline-flex items-center gap-1 text-active hover:underline"
      aria-label="Copy receipt"
    >
      <Copy size={12} />
      Copy
    </button>
  </p>
);

const ElectionsPage: React.FC = () => {
  const location = useLocation();
  const [elections, setElections] = useState<Election[]>([]);
  const [voteStatuses, setVoteStatuses] = useState<Record<string, VoteStatus>>({});
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [resultsElection, setResultsElection] = useState<Election | null>(null);
  const [resultPositions, setResultPositions] = useState<ResultPositionDetail[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const navigationState = location.state as { electionCompletedMessage?: string; receipt?: VoteReceipt } | null;
  const completedMessage = navigationState?.electionCompletedMessage;
  const justCastReceipt = navigationState?.receipt;

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
      toast.error(getApiErrorMessage(error, 'Failed to load elections'));
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

  // Refetch just after the next open/close time so the ballot button changes without a manual refresh
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
      const positions = await Promise.all(
        snapshot.positions.map((position) =>
          electionService.getResultsByPosition(election._id, String(position.positionId)),
        ),
      );
      setResultPositions(positions);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to load results'));
      setResultsElection(null);
    } finally {
      setIsLoadingResults(false);
    }
  };

  return (
    <div className="global-bg min-h-screen pt-32">
      <div className="mx-auto max-w-4xl space-y-6 px-4">
        <h1 className="text-3xl font-bold text-primary-clr">Elections</h1>

        {completedMessage && (
          <div>
            <p className="font-serif text-3xl font-semibold leading-tight text-green-800 md:text-4xl">
              {completedMessage}
            </p>
            {justCastReceipt && (
              <ReceiptLine receiptId={justCastReceipt.receiptId} submittedAt={justCastReceipt.submittedAt} />
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader className="animate-spin" size={18} />
            Loading elections...
          </div>
        ) : elections.length === 0 ? (
          <div className="rounded-lg border border-border bg-white p-8 text-center">
            <CalendarDays className="mx-auto mb-3 text-stroke-clr" size={36} />
            <p className="text-muted-foreground">No elections available.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {elections.map((election) => {
              const ballot = getBallotState(election);
              const voteStatus = voteStatuses[election._id];
              const hasVoted = Boolean(voteStatus?.hasVoted);
              const statusLabel =
                ballot.kind === 'results'
                  ? 'RESULTS PUBLISHED'
                  : ballot.kind === 'reviewing'
                    ? 'BEING REVIEWED'
                    : hasVoted
                      ? 'VOTED'
                      : ballot.kind === 'open'
                        ? 'OPEN'
                        : 'UPCOMING';

              return (
                <article key={election._id} className="rounded-lg border border-border bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-primary-clr">{election.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{election.academicYear || 'Election'}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        ballot.kind === 'reviewing'
                          ? 'bg-yellow-100 text-yellow-800'
                          : ballot.kind === 'results' || hasVoted
                            ? 'bg-green-100 text-green-800'
                            : 'bg-active/10 text-active'
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  {election.description && <p className="mt-4 text-muted-foreground">{election.description}</p>}

                  <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {election.startTime && <span>Starts {new Date(election.startTime).toLocaleString()}</span>}
                    {election.endTime && <span>Ends {new Date(election.endTime).toLocaleString()}</span>}
                  </div>

                  <div className="mt-5">
                    {ballot.kind === 'results' ? (
                      <button
                        type="button"
                        onClick={() => handleViewResults(election)}
                        className="inline-flex items-center gap-2 rounded-md bg-active px-4 py-2 font-semibold text-white hover:bg-button"
                      >
                        <Eye size={18} />
                        View results
                      </button>
                    ) : ballot.kind === 'reviewing' ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-yellow-100 px-4 py-2 font-semibold text-yellow-800"
                      >
                        <Vote size={18} />
                        Results are being reviewed
                      </button>
                    ) : hasVoted ? (
                      <button
                        type="button"
                        disabled
                        className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-green-100 px-4 py-2 font-semibold text-green-800"
                      >
                        <CheckCircle size={18} />
                        You have voted
                      </button>
                    ) : ballot.kind === 'open' ? (
                      <Link
                        to={`/elections/${election._id}/vote`}
                        className="inline-flex items-center gap-2 rounded-md bg-active px-4 py-2 font-semibold text-white hover:bg-button"
                      >
                        <Vote size={18} />
                        Open ballot
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-gray-300 px-4 py-2 font-semibold text-gray-600"
                      >
                        <Vote size={18} />
                        {ballot.message}
                      </button>
                    )}
                    {hasVoted && voteStatus?.receiptId && (
                      <ReceiptLine receiptId={voteStatus.receiptId} submittedAt={voteStatus.submittedAt} />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {resultsElection && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Election Results</h2>
                  <p className="text-sm text-gray-500">{resultsElection.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setResultsElection(null);
                    setResultPositions([]);
                  }}
                  className="rounded-md border px-4 py-2 font-semibold hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              {isLoadingResults ? (
                <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
                  <Loader className="h-5 w-5 animate-spin" />
                  Loading results...
                </div>
              ) : resultPositions.length === 0 ? (
                <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">No results are available yet.</p>
              ) : (
                <div className="space-y-4">
                  {resultPositions.map((position) => (
                    <div key={position.positionId} className="rounded-lg border border-gray-200 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-gray-900">{position.positionTitle || 'Position'}</h3>
                        {position.outcome === 'TIE' && (
                          <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">Tie</span>
                        )}
                        {position.outcome === 'NO_VOTES' && (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">No votes</span>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Rank</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Candidate</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Votes</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600">Percentage</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {position.rankings.map((ranking) => {
                              const isWinner = Boolean(position.winnerId) && position.winnerId === ranking.candidateId;
                              return (
                                <tr key={ranking.candidateId} className={isWinner ? 'bg-green-50' : undefined}>
                                  <td className="px-3 py-2 font-medium text-gray-700">{ranking.rank}</td>
                                  <td className="px-3 py-2 text-gray-900">
                                    {ranking.candidateName || 'Candidate'}
                                    {isWinner && <span className="ml-2 text-xs font-semibold text-green-700">Winner</span>}
                                  </td>
                                  <td className="px-3 py-2 text-gray-700">{ranking.votes}</td>
                                  <td className="px-3 py-2 text-gray-700">{ranking.percentage}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ElectionsPage;
