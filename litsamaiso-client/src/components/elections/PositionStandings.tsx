import React from 'react';
import { Crown, Scale, VoteIcon } from 'lucide-react';
import type { ResultOutcome } from '../../types';
import { cn } from '../../lib/utils';
import { Avatar, Pill } from './ui';

export type Standing = {
  candidateId: string;
  name: string;
  imageUrl?: string;
  votes: number;
  percentage: number;
  rank: number;
  isWinner: boolean;
};

type PositionStandingsProps = {
  title: string;
  outcome?: ResultOutcome;
  standings: Standing[];
};

// One position's result: the leader highlighted on top, everyone ranked below with vote bars
const PositionStandings: React.FC<PositionStandingsProps> = ({ title, outcome, standings }) => {
  const totalVotes = standings.reduce((sum, s) => sum + s.votes, 0);
  const winner = standings.find((s) => s.isWinner);
  const leaders = standings.filter((s) => s.rank === 1 && s.votes > 0);

  return (
    <article className="animate-rise-in overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-3 px-5 pt-4">
        <h3 className="font-semibold text-primary-clr">{title}</h3>
        <span className="text-xs font-medium text-slate-400">
          {totalVotes} vote{totalVotes === 1 ? '' : 's'}
        </span>
      </header>

      <div className="px-5 pt-3">
        {outcome === 'WINNER' && winner ? (
          <div className="flex items-center gap-3 rounded-2xl bg-button p-3 text-white">
            <div className="relative">
              <Avatar name={winner.name} imageUrl={winner.imageUrl} size="lg" className="bg-white/10 text-white ring-white/20" />
              <Crown className="absolute -right-1 -top-2 h-5 w-5 fill-amber-300 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Winner</p>
              <p className="truncate text-base font-semibold">{winner.name}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold">{winner.percentage}%</p>
              <p className="text-xs text-white/60">{winner.votes} votes</p>
            </div>
          </div>
        ) : outcome === 'TIE' ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Scale className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">Tie — no winner declared</p>
              <p className="truncate text-xs text-amber-800">{leaders.map((s) => s.name).join(' and ')} share first place</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <VoteIcon className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-slate-600">No votes were cast for this position</p>
          </div>
        )}
      </div>

      {standings.length > 1 ? (
      <ol className="space-y-3 px-5 py-4">
        {standings.map((s) => (
          <li key={s.candidateId} className="flex items-center gap-3">
            <span
              className={cn(
                'w-5 text-center text-sm font-bold',
                s.rank === 1 && s.votes > 0 ? 'text-active' : 'text-slate-400',
              )}
            >
              {s.rank}
            </span>
            <Avatar name={s.name} imageUrl={s.imageUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-primary-clr">{s.name}</span>
                  {s.isWinner && <Pill tone="green">Winner</Pill>}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {s.votes} · <span className="font-semibold text-primary-clr">{s.percentage}%</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-700 ease-out',
                    s.isWinner ? 'bg-button' : s.rank === 1 && s.votes > 0 ? 'bg-amber-500' : 'bg-stroke-clr',
                  )}
                  style={{ width: `${s.percentage}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
      ) : (
        <p className="px-5 pb-4 pt-2 text-xs text-slate-400">Only candidate for this position</p>
      )}
    </article>
  );
};

export default PositionStandings;
