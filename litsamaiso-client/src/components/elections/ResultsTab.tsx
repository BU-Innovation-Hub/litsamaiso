import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Loader2, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { electionService } from '../../services/electionService';
import type { Election, ResultSnapshot } from '../../types';
import { getApiErrorMessage } from '../../utils/apiError';
import ConfirmDialog from './ConfirmDialog';
import {
  OUTCOME_LABELS,
  getCandidateId,
  getCandidateName,
  getPositionId,
  getPositionTitle,
  getStatus,
  makeFileSafeName,
  type PositionWithCandidates,
} from './electionHelpers';
import { createStyledResultsPdfBlob } from './resultsPdf';

type ResultsTabProps = {
  election: Election;
  positions: PositionWithCandidates[];
  onChanged: () => Promise<void>;
};

const ResultsTab: React.FC<ResultsTabProps> = ({ election, positions, onChanged }) => {
  const status = getStatus(election);
  const [snapshot, setSnapshot] = useState<ResultSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirming, setConfirming] = useState<'publish' | 'archive' | null>(null);
  const [busy, setBusy] = useState(false);

  const loadResults = useCallback(async () => {
    setIsLoading(true);
    try {
      setSnapshot(await electionService.getResults(election._id));
    } catch {
      // A closed election without a snapshot (e.g. the count job failed) can be counted on demand
      if (status === 'CLOSED') {
        try {
          setSnapshot(await electionService.recomputeResults(election._id));
        } catch (error: unknown) {
          toast.error(getApiErrorMessage(error, 'Failed to count results'));
        }
      } else {
        setSnapshot(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [election._id, status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadResults();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadResults]);

  const handleExportPdf = () => {
    if (!snapshot) return;
    const blob = createStyledResultsPdfBlob({ election, snapshot, positions });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${makeFileSafeName(`${election.title} Results`) || 'election-results'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      if (confirming === 'publish') {
        await electionService.publishResults(election._id);
        toast.success('Results published to students');
      } else {
        await electionService.archiveElection(election._id);
        toast.success('Election archived');
      }
      setConfirming(null);
      await onChanged();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Action failed'));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'COUNTING') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-white p-6 shadow">
        <p className="text-sm text-gray-600">Votes are being counted. This usually takes a few seconds.</p>
        <button
          type="button"
          onClick={() => void onChanged()}
          className="inline-flex items-center gap-2 rounded-md border px-4 py-2 font-semibold hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Results</h2>
          {snapshot?.generatedAt && (
            <p className="text-xs text-gray-400">Counted {new Date(snapshot.generatedAt).toLocaleString()}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {status === 'CLOSED'
              ? 'Review the results below. Students cannot see them until you publish.'
              : status === 'RESULTS_PUBLISHED'
                ? 'Results are published and visible to students.'
                : 'This election is archived and hidden from students.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isLoading || !snapshot}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 font-semibold hover:bg-gray-50 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </button>
          {status === 'CLOSED' && (
            <button
              type="button"
              onClick={() => setConfirming('publish')}
              disabled={isLoading || !snapshot}
              className="inline-flex items-center gap-2 rounded-md bg-button px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Publish Results
            </button>
          )}
          {(status === 'CLOSED' || status === 'RESULTS_PUBLISHED') && (
            <button
              type="button"
              onClick={() => setConfirming('archive')}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 font-semibold text-red-600 hover:bg-red-50"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading results...
        </div>
      ) : !snapshot || snapshot.positions.length === 0 ? (
        <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">No results are available.</p>
      ) : (
        <div className="space-y-4">
          {snapshot.positions.map((positionResult) => {
            const position = positions.find((item) => getPositionId(item) === String(positionResult.positionId));
            const winnerId = positionResult.winnerId ? String(positionResult.winnerId) : '';
            const outcome = positionResult.outcome || (winnerId ? 'WINNER' : undefined);

            return (
              <div key={String(positionResult.positionId)} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{position ? getPositionTitle(position) : 'Position'}</h3>
                  {outcome && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        outcome === 'WINNER' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {OUTCOME_LABELS[outcome]}
                    </span>
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
                      {positionResult.rankings.map((ranking) => {
                        const candidate = position?.candidates.find(
                          (item) => getCandidateId(item) === String(ranking.candidateId),
                        );
                        const isWinner = winnerId === String(ranking.candidateId);
                        return (
                          <tr key={String(ranking.candidateId)} className={isWinner ? 'bg-green-50' : undefined}>
                            <td className="px-3 py-2 font-medium text-gray-700">{ranking.rank}</td>
                            <td className="px-3 py-2 text-gray-900">
                              {candidate ? getCandidateName(candidate) : 'Candidate'}
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
            );
          })}
        </div>
      )}

      {confirming === 'publish' && (
        <ConfirmDialog
          title="Publish results?"
          confirmLabel="Publish results"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(null)}
        >
          <p>All students will be able to see these results. Published results are final and cannot be recounted.</p>
        </ConfirmDialog>
      )}

      {confirming === 'archive' && (
        <ConfirmDialog
          title="Archive election?"
          confirmLabel="Archive"
          tone="danger"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(null)}
        >
          <p>The election and its results will be hidden from students. It stays available here as a record.</p>
        </ConfirmDialog>
      )}
    </div>
  );
};

export default ResultsTab;
