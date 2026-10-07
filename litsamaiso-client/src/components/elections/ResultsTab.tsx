import React from 'react';
import { BarChart3, Scale, Trophy, Vote } from 'lucide-react';
import type { Election, ResultSnapshot } from '../../types';
import PositionStandings from './PositionStandings';
import {
  countBallots,
  getCandidateId,
  getCandidateName,
  getPositionId,
  getPositionTitle,
  getStatus,
  type PositionWithCandidates,
} from './electionHelpers';
import { Card, EmptyState, Pill, Skeleton } from './ui';

type ResultsTabProps = {
  election: Election;
  positions: PositionWithCandidates[];
  snapshot: ResultSnapshot | null;
  loading: boolean;
};

const ResultsTab: React.FC<ResultsTabProps> = ({ election, positions, snapshot, loading }) => {
  const status = getStatus(election);

  if (loading || status === 'COUNTING') {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  if (!snapshot || snapshot.positions.length === 0) {
    return (
      <Card>
        <EmptyState icon={BarChart3} title="No results yet" description="Results appear here once votes are counted." />
      </Card>
    );
  }

  // Positions with no candidates weren't on the ballot; keep them out of the way
  const contested = snapshot.positions.filter((p) => p.rankings.length > 0);
  const uncontested = snapshot.positions.length - contested.length;
  const winners = contested.filter((p) => p.outcome === 'WINNER' || (!p.outcome && p.winnerId)).length;
  const ties = contested.filter((p) => p.outcome === 'TIE').length;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <Stat icon={Vote} label="Ballots cast" value={countBallots(snapshot)} />
        <Stat icon={Trophy} label="Winners declared" value={`${winners} / ${contested.length}`} />
        {ties > 0 && <Stat icon={Scale} label="Ties" value={ties} tone="amber" />}
        <span className="ml-auto">
          {status === 'CLOSED' ? (
            <Pill tone="amber">Only you can see these results</Pill>
          ) : status === 'RESULTS_PUBLISHED' ? (
            <Pill tone="green">Published to students</Pill>
          ) : (
            <Pill>Archived</Pill>
          )}
        </span>
      </Card>

      <p className="px-1 text-xs text-slate-400">
        Counted {new Date(snapshot.generatedAt).toLocaleString()}
        {uncontested > 0 && ` · ${uncontested} position${uncontested === 1 ? '' : 's'} had no candidates`}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {contested.map((result) => {
          const position = positions.find((p) => getPositionId(p) === String(result.positionId));
          const winnerId = result.winnerId ? String(result.winnerId) : '';
          return (
            <PositionStandings
              key={String(result.positionId)}
              title={position ? getPositionTitle(position) : 'Position'}
              outcome={result.outcome || (winnerId ? 'WINNER' : 'NO_VOTES')}
              ballots={snapshot.totalBallots}
              standings={result.rankings.map((ranking) => {
                const candidate = position?.candidates.find((c) => getCandidateId(c) === String(ranking.candidateId));
                return {
                  candidateId: String(ranking.candidateId),
                  name: candidate ? getCandidateName(candidate) : 'Candidate',
                  imageUrl: candidate?.imageUrl,
                  votes: ranking.votes,
                  percentage: ranking.percentage,
                  rank: ranking.rank,
                  isWinner: winnerId === String(ranking.candidateId),
                };
              })}
            />
          );
        })}
      </div>
    </div>
  );
};

const Stat = ({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'amber';
}) => (
  <div className="flex items-center gap-3">
    <span
      className={
        tone === 'amber'
          ? 'flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600'
          : 'flex h-9 w-9 items-center justify-center rounded-xl bg-active/10 text-active'
      }
    >
      <Icon className="h-4 w-4" />
    </span>
    <div>
      <p className="text-lg font-bold leading-tight tabular-nums text-primary-clr">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  </div>
);

export default ResultsTab;
