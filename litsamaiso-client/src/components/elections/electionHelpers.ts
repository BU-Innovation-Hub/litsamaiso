import { useEffect, useState } from 'react';
import type { Candidate, Election, Position, ResultOutcome } from '../../types';

export type ElectionStatus = NonNullable<Election['status']>;
export type PositionWithCandidates = Position & { candidates: Candidate[] };

// Positions and candidates can only change before voting opens
export const EDITABLE_STATUSES: ElectionStatus[] = ['DRAFT', 'SCHEDULED'];
export const RESULT_STATUSES: ElectionStatus[] = ['CLOSED', 'COUNTING', 'RESULTS_PUBLISHED', 'ARCHIVED'];

export const getStatus = (election: Election): ElectionStatus => election.status || 'DRAFT';
export const isEditable = (election: Election) => EDITABLE_STATUSES.includes(getStatus(election));
export const hasResults = (election: Election) => RESULT_STATUSES.includes(getStatus(election));

export const STATUS_LABELS: Record<ElectionStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  OPEN: 'Open',
  CLOSED: 'Closed',
  COUNTING: 'Counting',
  RESULTS_PUBLISHED: 'Results published',
  ARCHIVED: 'Archived',
};

export const STATUS_BADGE_CLASSES: Record<ElectionStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  OPEN: 'bg-green-100 text-green-800',
  CLOSED: 'bg-yellow-100 text-yellow-800',
  COUNTING: 'bg-yellow-100 text-yellow-800',
  RESULTS_PUBLISHED: 'bg-purple-100 text-purple-800',
  ARCHIVED: 'bg-gray-200 text-gray-600',
};

export const OUTCOME_LABELS: Record<ResultOutcome, string> = {
  WINNER: 'Winner',
  TIE: 'Tie',
  NO_VOTES: 'No votes',
};

export const getPositionId = (position: Position) => position._id || '';
export const getPositionTitle = (position: Position) => position.title || position.name || 'Position';
export const getCandidateId = (candidate: Candidate) => candidate._id || '';
export const getCandidateName = (candidate: Candidate) => candidate.fullName || candidate.name || 'Candidate';

export const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString() : '');

// <input type="datetime-local"> works in the browser's local time without a zone
export const toDateTimeLocalValue = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
};

// Send an unambiguous instant so the server doesn't read local time as UTC
export const fromDateTimeLocalValue = (value: string) => new Date(value).toISOString();

export const makeFileSafeName = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

// "2d 4h", "3h 12m", "45m", "under a minute"
export const formatDuration = (ms: number) => {
  const minutes = Math.floor(Math.abs(ms) / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return 'under a minute';
};

// Short human countdown relative to `now`: "in 3h 12m" / "2h ago"
export const formatRelative = (value: string | undefined, now: number) => {
  if (!value) return '';
  const diff = new Date(value).getTime() - now;
  return diff >= 0 ? `in ${formatDuration(diff)}` : `${formatDuration(diff)} ago`;
};

export const formatDate = (value?: string) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

export const isVotable = (candidate: { approved?: boolean; disqualified?: boolean }) =>
  Boolean(candidate.approved) && !candidate.disqualified;

// Positions that appear on the ballot: at least one approved, non-disqualified candidate
export const ballotPositions = (positions: PositionWithCandidates[]) =>
  positions.filter((p) => p.candidates.some(isVotable));

// Every ballot covers every ballot position, so the busiest position's total is the ballot count
export const countBallots = (snapshot: { positions: Array<{ rankings: Array<{ votes: number }> }> } | null) =>
  snapshot ? Math.max(0, ...snapshot.positions.map((p) => p.rankings.reduce((sum, r) => sum + r.votes, 0))) : 0;

// Ticks every `intervalMs` so countdowns stay current
export const useNow = (intervalMs = 30_000, offsetMs = 0) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now + offsetMs;
};
