import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CircleCheck, Copy, Hourglass, Lock, ShieldCheck, Vote } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatRelative, useNow } from '../components/elections/electionHelpers';
import { Avatar, Button, Card, EmptyState, Modal, ProgressBar, Skeleton } from '../components/elections/ui';
import { cn } from '../lib/utils';
import { electionService } from '../services/electionService';
import type { Candidate, Election, Position, VoteReceipt } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

type PositionWithCandidates = Position & { candidates: Candidate[] };

const getPositionTitle = (position: Position) => position.title || position.name || 'Position';
const getCandidateName = (candidate: Candidate) => candidate.fullName || candidate.name || 'Candidate';

// The server keeps the status current, so it decides availability rather than the device clock
const getBallotUnavailableMessage = (election: Election) => {
  switch (election.status) {
    case 'OPEN':
      return '';
    case 'SCHEDULED':
      return election.startTime ? `Voting opens ${formatDate(election.startTime)}.` : 'Voting has not opened yet.';
    case 'RESULTS_PUBLISHED':
      return 'Voting has ended and the results are published.';
    case 'CLOSED':
    case 'COUNTING':
      return 'Voting has ended. Results are being reviewed.';
    default:
      return 'Voting has not opened yet.';
  }
};

const VotingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<PositionWithCandidates[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const positionRefs = useRef<Record<string, HTMLElement | null>>({});
  // One key per ballot visit, so a retried submit returns the same receipt instead of failing
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const loadBallot = async () => {
      if (!id) return;
      try {
        const electionData = await electionService.getElection(id);
        const voteStatus = await electionService.getVoteStatus(id);
        if (voteStatus.hasVoted) {
          navigate('/elections', {
            replace: true,
            state: { electionCompletedMessage: `You already voted in ${electionData.title}.` },
          });
          return;
        }
        const positionData = await electionService.getPositions(id);
        const withCandidates = await Promise.all(
          positionData.map(async (position) => ({
            ...position,
            candidates: position._id ? await electionService.getCandidates(position._id) : [],
          })),
        );
        setElection(electionData);
        // Positions without approved candidates aren't on the ballot
        setPositions(withCandidates.filter((position) => position.candidates.length > 0));
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, 'Could not load the ballot'));
      } finally {
        setLoading(false);
      }
    };
    void loadBallot();
  }, [id, navigate]);

  const chosen = positions.filter((p) => p._id && selected[p._id]).length;
  const complete = positions.length > 0 && chosen === positions.length;

  const handleReview = () => {
    const missing = positions.find((p) => p._id && !selected[p._id]);
    if (missing?._id) {
      toast.warning(`Choose a candidate for ${getPositionTitle(missing)}`);
      positionRefs.current[missing._id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlighted(missing._id);
      window.setTimeout(() => setHighlighted(null), 1600);
      return;
    }
    setReviewing(true);
  };

  const handleSubmit = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      const result = await electionService.castVote(id, {
        selections: positions.map((p) => ({ positionId: p._id as string, candidateId: selected[p._id as string] })),
        idempotencyKey,
      });
      setReviewing(false);
      setReceipt(result);
      toast.success('Your vote has been recorded');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } })?.response?.status === 409) {
        navigate('/elections', { replace: true, state: { electionCompletedMessage: 'You have already voted in this election.' } });
        return;
      }
      toast.error(getApiErrorMessage(error, 'Your vote could not be submitted. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyReceipt = async () => {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.receiptId);
      toast.success('Receipt copied');
    } catch {
      toast.error('Could not copy the receipt');
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="global-bg min-h-screen pt-36">
      <div className="mx-auto max-w-3xl px-4 pb-36">{children}</div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>,
    );
  }

  if (!election) {
    return shell(
      <Card>
        <EmptyState
          icon={Vote}
          title="Election not found"
          action={
            <Link to="/elections" className="font-semibold text-active hover:underline">
              Back to elections
            </Link>
          }
        />
      </Card>,
    );
  }

  if (receipt) {
    return shell(
      <Card className="animate-rise-in px-6 py-12 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CircleCheck className="h-9 w-9" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-primary-clr">Your vote is in</h1>
        <p className="mt-1 text-sm text-slate-500">{election.title}</p>
        <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receipt</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <code className="truncate text-sm text-primary-clr">{receipt.receiptId}</code>
            <button
              type="button"
              onClick={() => void copyReceipt()}
              aria-label="Copy receipt"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-primary-clr"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Submitted {formatDate(receipt.submittedAt)}</p>
        </div>
        <p className="mx-auto mt-4 flex max-w-sm items-center justify-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4" />
          Your ballot is stored separately from your identity.
        </p>
        <Link
          to="/elections"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-button px-6 font-semibold text-white hover:bg-primary-clr"
        >
          Back to elections
        </Link>
      </Card>,
    );
  }

  const unavailable = getBallotUnavailableMessage(election);
  if (unavailable) {
    return shell(
      <Card>
        <EmptyState
          icon={Lock}
          title={election.title}
          description={unavailable}
          action={
            <Link to="/elections" className="font-semibold text-active hover:underline">
              Back to elections
            </Link>
          }
        />
      </Card>,
    );
  }

  return (
    <>
      {shell(
        <div className="space-y-5">
          <Link to="/elections" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-clr">
            <ArrowLeft className="h-4 w-4" />
            Elections
          </Link>

          <header>
            <h1 className="text-3xl font-bold text-primary-clr">{election.title}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
              <Hourglass className="h-4 w-4 text-emerald-600" />
              Voting closes <span className="font-semibold text-emerald-700">{formatRelative(election.endTime, now)}</span>
            </p>
          </header>

          {positions.length === 0 ? (
            <Card>
              <EmptyState icon={Vote} title="Nothing to vote on" description="This ballot has no candidates yet." />
            </Card>
          ) : (
            positions.map((position, index) => {
              const positionId = position._id as string;
              const choice = selected[positionId];
              return (
                <section
                  key={positionId}
                  ref={(el) => {
                    positionRefs.current[positionId] = el;
                  }}
                  className={cn(
                    'rounded-3xl border bg-white/90 p-5 shadow-sm backdrop-blur transition sm:p-6',
                    highlighted === positionId ? 'border-amber-400 ring-4 ring-amber-100' : 'border-white/70',
                  )}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {index + 1} of {positions.length}
                      </p>
                      <h2 className="text-xl font-bold text-primary-clr">{getPositionTitle(position)}</h2>
                      {position.description && <p className="text-sm text-slate-500">{position.description}</p>}
                    </div>
                    {choice && (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>

                  <div role="radiogroup" aria-label={getPositionTitle(position)} className="grid gap-3 sm:grid-cols-2">
                    {position.candidates.map((candidate) => {
                      const isSelected = choice === candidate._id;
                      return (
                        <button
                          key={candidate._id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => candidate._id && setSelected((prev) => ({ ...prev, [positionId]: candidate._id as string }))}
                          className={cn(
                            'relative flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition',
                            isSelected
                              ? 'border-active bg-active/5 shadow-md shadow-active/10'
                              : 'border-slate-200 bg-white hover:border-active/40',
                          )}
                        >
                          <Avatar name={getCandidateName(candidate)} imageUrl={candidate.imageUrl} size="lg" />
                          <div className="min-w-0 flex-1 pr-6">
                            <p className="font-semibold text-primary-clr">{getCandidateName(candidate)}</p>
                            <p className="text-xs font-medium text-slate-500">{candidate.party || 'Independent'}</p>
                            {candidate.manifesto && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{candidate.manifesto}</p>}
                          </div>
                          <span
                            className={cn(
                              'absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full border-2 transition',
                              isSelected ? 'border-active bg-active text-white' : 'border-slate-300',
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>,
      )}

      {positions.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary-clr">
                {chosen} of {positions.length} chosen
              </p>
              <div className="mt-1.5">
                <ProgressBar value={(chosen / positions.length) * 100} tone={complete ? 'green' : 'indigo'} />
              </div>
            </div>
            <Button onClick={handleReview} className="h-11 px-6">
              Review ballot
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={reviewing}
        onOpenChange={(open) => !submitting && setReviewing(open)}
        title="Review your ballot"
        description="You can't change your vote after submitting."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewing(false)} disabled={submitting}>
              Change
            </Button>
            <Button loading={submitting} onClick={() => void handleSubmit()}>
              Submit ballot
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {positions.map((position) => {
            const candidate = position.candidates.find((c) => c._id === selected[position._id as string]);
            return (
              <li key={position._id} className="flex items-center gap-3 px-4 py-3">
                {candidate && <Avatar name={getCandidateName(candidate)} imageUrl={candidate.imageUrl} size="sm" />}
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{getPositionTitle(position)}</p>
                  <p className="truncate text-sm font-semibold text-primary-clr">
                    {candidate ? getCandidateName(candidate) : '—'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
};

export default VotingPage;
