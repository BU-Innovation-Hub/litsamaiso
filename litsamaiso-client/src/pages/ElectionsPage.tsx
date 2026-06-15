import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, CheckCircle, Eye, Loader, Vote } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../services/electionService';
import type { Election, ResultPositionDetail } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

const getElectionAvailability = (election: Election, now: number) => {
  const startTime = election.startTime ? new Date(election.startTime).getTime() : null;
  const endTime = election.endTime ? new Date(election.endTime).getTime() : null;

  if (startTime && now < startTime) {
    return {
      canOpen: false,
      message: `Ballot opens ${new Date(startTime).toLocaleString()}`,
    };
  }

  if (endTime && now >= endTime) {
    return {
      canOpen: false,
      message: 'Voting has closed',
    };
  }

  if (election.status !== 'OPEN') {
    return {
      canOpen: false,
      message: 'Ballot is not open yet',
    };
  }

  return {
    canOpen: true,
    message: 'Ballot is open',
  };
};

const hasElectionEnded = (election: Election, now: number) => (
  Boolean(election.endTime && now >= new Date(election.endTime).getTime())
);

const ElectionsPage: React.FC = () => {
  const location = useLocation();
  const [elections, setElections] = useState<Election[]>([]);
  const [completedElectionIds, setCompletedElectionIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [resultsElection, setResultsElection] = useState<Election | null>(null);
  const [resultPositions, setResultPositions] = useState<ResultPositionDetail[]>([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const completedMessage = (location.state as { electionCompletedMessage?: string } | null)?.electionCompletedMessage;

  useEffect(() => {
    const loadElections = async () => {
      try {
        const data = await electionService.getElections();
        setElections(data);
        const completedEntries = await Promise.all(
          data.map(async (election) => {
            try {
              const status = await electionService.getVoteStatus(election._id);
              return [election._id, status.hasVoted] as const;
            } catch {
              return [election._id, false] as const;
            }
          }),
        );
        setCompletedElectionIds(new Set(completedEntries.filter(([, hasVoted]) => hasVoted).map(([id]) => id)));
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, 'Failed to load elections'));
      } finally {
        setIsLoading(false);
      }
    };

    void loadElections();
  }, []);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const timeout = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 15_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

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
      <div className="mx-auto max-w-4xl px-4 space-y-6">
      <h1 className="text-3xl font-bold text-primary-clr">Elections</h1>
      {completedMessage && (
        <p className="font-serif text-3xl font-semibold leading-tight text-green-800 md:text-4xl">
          {completedMessage}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader className="animate-spin" size={18} />
          Loading elections...
        </div>
      ) : elections.length === 0 ? (
        <div className="bg-white rounded-lg border border-border p-8 text-center">
          <CalendarDays className="mx-auto mb-3 text-stroke-clr" size={36} />
          <p className="text-muted-foreground">No elections available.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {elections.map((election) => {
            const availability = getElectionAvailability(election, now);
            const hasCompleted = completedElectionIds.has(election._id);
            const isClosed = hasElectionEnded(election, now);
            const hasPublishedResults = Boolean(election.resultsPublished || election.status === 'RESULTS_PUBLISHED');
            const isBeingReviewed = isClosed && !hasPublishedResults;
            const statusLabel = hasPublishedResults
              ? 'RESULTS PUBLISHED'
              : isBeingReviewed
                ? 'BEING REVIEWED'
                : hasCompleted
                  ? 'COMPLETED'
                  : election.status || 'OPEN';

            return (
              <article
                key={election._id}
                className="bg-white rounded-lg border border-border p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-primary-clr">
                      {election.title}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {election.academicYear || election.status || 'Election'}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    hasPublishedResults
                      ? 'bg-green-100 text-green-800'
                      : isBeingReviewed
                        ? 'bg-yellow-100 text-yellow-800'
                      : hasCompleted
                        ? 'bg-green-100 text-green-800'
                        : 'bg-active/10 text-active'
                  }`}>
                    {statusLabel}
                  </span>
                </div>

                {election.description && (
                  <p className="text-muted-foreground mt-4">{election.description}</p>
                )}

                <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  {election.startTime && <span>Starts {new Date(election.startTime).toLocaleString()}</span>}
                  {election.endTime && <span>Ends {new Date(election.endTime).toLocaleString()}</span>}
                </div>

                <div className="mt-5">
                  {hasPublishedResults ? (
                    <button
                      type="button"
                      onClick={() => handleViewResults(election)}
                      className="inline-flex items-center gap-2 rounded-md bg-active px-4 py-2 font-semibold text-white hover:bg-button"
                    >
                      <Eye size={18} />
                      View results
                    </button>
                  ) : isBeingReviewed ? (
                    <button
                      type="button"
                      disabled
                      className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-yellow-100 px-4 py-2 font-semibold text-yellow-800"
                    >
                      <Vote size={18} />
                      Results are being reviewed
                    </button>
                  ) : hasCompleted ? (
                    <button
                      type="button"
                      disabled
                      className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-green-100 px-4 py-2 font-semibold text-green-800"
                    >
                      <CheckCircle size={18} />
                      Election completed
                    </button>
                  ) : availability.canOpen ? (
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
                      {availability.message}
                    </button>
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
                    <h3 className="mb-3 font-semibold text-gray-900">{position.positionTitle || 'Position'}</h3>
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
                          {position.rankings.map((ranking) => (
                            <tr key={ranking.candidateId} className={ranking.rank === 1 ? 'bg-green-50' : undefined}>
                              <td className="px-3 py-2 font-medium text-gray-700">{ranking.rank}</td>
                              <td className="px-3 py-2 text-gray-900">
                                {ranking.candidateName || 'Candidate'}
                                {ranking.rank === 1 && <span className="ml-2 text-xs font-semibold text-green-700">Winner</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{ranking.votes}</td>
                              <td className="px-3 py-2 text-gray-700">{ranking.percentage}%</td>
                            </tr>
                          ))}
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
