import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CircleCheck, Copy, Hourglass, Lock, ScanFace, ShieldCheck, Vote } from 'lucide-react';
import { toast } from 'sonner';
import FaceCapture from '../components/FaceCapture';
import { formatDate, formatRelative, useNow } from '../components/elections/electionHelpers';
import { Avatar, Button, Card, EmptyState, Modal, ProgressBar, Skeleton } from '../components/elections/ui';
import { cn } from '../lib/utils';
import { electionService } from '../services/electionService';
import { profileService } from '../services/profileService';
import type { Candidate, Election, Position, VoteReceipt } from '../types';
import { getApiErrorCode, getApiErrorMessage } from '../utils/apiError';

type PositionWithCandidates = Position & { candidates: Candidate[] };

// How often an open ballot checks whether voting has ended. The server takes a ballot opened before
// the close for 60 seconds after it, which covers one check plus the countdown.
const CLOSE_CHECK_INTERVAL_MS = 15_000;
const AUTO_SUBMIT_SECONDS = 5;
// setTimeout misfires on delays past this, so a far-off close is left to the regular checks
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

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
  // The ballot opens once the student's face matches their profile photo
  const [faceToken, setFaceToken] = useState<string | null>(null);
  const [hasFaceProfile, setHasFaceProfile] = useState(true);
  const [verifyingFace, setVerifyingFace] = useState(false);
  // One key per ballot visit, so a retried submit returns the same receipt instead of failing
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  // Voting ended while the ballot was open: the choices made so far are submitted after a countdown
  const [votingClosed, setVotingClosed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [closingError, setClosingError] = useState<string | null>(null);

  useEffect(() => {
    const loadBallot = async () => {
      if (!id) return;
      try {
        const electionData = await electionService.getElection(id);
        const [voteStatus, profile] = await Promise.all([
          electionService.getVoteStatus(id),
          profileService.getProfile(),
        ]);
        setHasFaceProfile(Boolean(profile.hasFaceProfile));
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
  const skipped = positions.length - chosen;

  // Clicking the chosen candidate again clears the choice, so the position is skipped
  const toggleChoice = (positionId: string, candidateId: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[positionId] === candidateId) delete next[positionId];
      else next[positionId] = candidateId;
      return next;
    });

  // Positions can be left blank, but a ballot needs at least one choice
  const handleReview = () => {
    if (chosen === 0) {
      toast.warning('Choose a candidate for at least one position');
      return;
    }
    setReviewing(true);
  };

  const handleVerifyFace = async (photo: Blob) => {
    if (!id) return;
    setVerifyingFace(true);
    try {
      const verification = await electionService.verifyFace(id, photo);
      setFaceToken(verification.faceToken);
      toast.success('Face confirmed. Your ballot is open.');
    } catch (error: unknown) {
      if (getApiErrorCode(error) === 'FACE_NOT_ENROLLED') {
        setHasFaceProfile(false);
        return;
      }
      toast.error(getApiErrorMessage(error, 'Your face could not be checked. Please try again.'));
    } finally {
      setVerifyingFace(false);
    }
  };

  // `closing` is set when voting ended mid-ballot, and failures are shown in the closing modal instead
  const handleSubmit = useCallback(
    async (closing = false) => {
      if (!id || !faceToken) return;
      setSubmitting(true);
      setClosingError(null);
      try {
        const result = await electionService.castVote(id, {
          selections: positions
            .filter((p) => p._id && selected[p._id])
            .map((p) => ({ positionId: p._id as string, candidateId: selected[p._id as string] })),
          idempotencyKey,
          faceToken,
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
        // Voting has ended, so a fresh face check wouldn't help
        if (closing) {
          setClosingError(
            getApiErrorCode(error) === 'FACE_VERIFICATION_REQUIRED'
              ? 'Your face check expired before voting ended, so your ballot could not be submitted.'
              : getApiErrorMessage(error, 'Your ballot could not be submitted.'),
          );
          return;
        }
        // The face check expired while the ballot was open. Choices are kept for after the next check.
        if (getApiErrorCode(error) === 'FACE_VERIFICATION_REQUIRED') {
          setReviewing(false);
          setFaceToken(null);
          toast.warning('Your face check expired. Verify again to submit your ballot.');
          return;
        }
        toast.error(getApiErrorMessage(error, 'Your vote could not be submitted. Please try again.'));
      } finally {
        setSubmitting(false);
      }
    },
    [id, faceToken, positions, selected, idempotencyKey, navigate],
  );

  // While the ballot is open, watch for voting ending: on the regular checks and right at the end time.
  // The server decides, so a wrong device clock or an extended end time doesn't end the ballot early.
  const ballotOpen = Boolean(id && faceToken && !receipt && positions.length > 0 && !votingClosed);
  const endTime = election?.endTime;
  useEffect(() => {
    if (!ballotOpen || !id) return;
    let cancelled = false;
    const check = async () => {
      try {
        const latest = await electionService.getElection(id);
        if (cancelled) return;
        if (latest.status === 'OPEN') {
          setElection(latest);
          return;
        }
        setVotingClosed(true);
        setSecondsLeft(AUTO_SUBMIT_SECONDS);
      } catch {
        // Offline for a moment; the next check tries again
      }
    };
    const interval = window.setInterval(() => void check(), CLOSE_CHECK_INTERVAL_MS);
    const untilEnd = endTime ? new Date(endTime).getTime() - Date.now() + 1_000 : MAX_TIMEOUT_MS;
    const atEnd = untilEnd < MAX_TIMEOUT_MS ? window.setTimeout(() => void check(), Math.max(untilEnd, 0)) : undefined;
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(atEnd);
    };
  }, [ballotOpen, id, endTime]);

  // Counts down, then submits the choices made so far. A ballot with no choices has nothing to submit.
  useEffect(() => {
    if (secondsLeft === null || chosen === 0 || receipt) return;
    const timer = window.setTimeout(() => {
      if (secondsLeft > 1) {
        setSecondsLeft(secondsLeft - 1);
        return;
      }
      setSecondsLeft(null);
      void handleSubmit(true);
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, chosen, receipt, handleSubmit]);

  const submitClosingBallotNow = () => {
    setSecondsLeft(null);
    void handleSubmit(true);
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

  if (positions.length > 0 && !faceToken) {
    return shell(
      <div className="space-y-5">
        <Link to="/elections" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary-clr">
          <ArrowLeft className="h-4 w-4" />
          Elections
        </Link>

        <Card className="p-5 sm:p-6">
          {hasFaceProfile ? (
            <>
              <div className="mb-5 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-active/10 text-active">
                  <ScanFace className="h-6 w-6" />
                </span>
                <div>
                  <h1 className="text-xl font-bold text-primary-clr">Confirm it's you</h1>
                  <p className="text-sm text-slate-500">
                    Your face is compared with your profile photo before the {election.title} ballot opens. This
                    photo isn't stored.
                  </p>
                </div>
              </div>
              <FaceCapture
                onCapture={handleVerifyFace}
                busy={verifyingFace}
                busyLabel="Checking your face..."
                captureLabel="Verify my face"
              />
            </>
          ) : (
            <EmptyState
              icon={ScanFace}
              title="Take your profile photo first"
              description="Voting checks your face against your profile photo, and you haven't taken one yet."
              action={
                <Link to="/profile" className="font-semibold text-active hover:underline">
                  Go to your profile
                </Link>
              }
            />
          )}
        </Card>
      </div>,
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
                  className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur transition sm:p-6"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {index + 1} of {positions.length}
                      </p>
                      <h2 className="text-xl font-bold text-primary-clr">{getPositionTitle(position)}</h2>
                      {position.description && <p className="text-sm text-slate-500">{position.description}</p>}
                      <p className="mt-1 text-xs text-slate-400">Choose one candidate, or leave it blank to skip.</p>
                    </div>
                    {choice ? (
                      <button
                        type="button"
                        onClick={() => toggleChoice(positionId, choice)}
                        className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-primary-clr"
                      >
                        Clear choice
                      </button>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                        Skipped
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
                          onClick={() => candidate._id && toggleChoice(positionId, candidate._id)}
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
                {skipped > 0 && chosen > 0 && <span className="font-normal text-slate-500"> · {skipped} skipped</span>}
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
        open={votingClosed}
        onOpenChange={() => undefined}
        dismissible={false}
        size="sm"
        title="Voting has ended"
        description={
          chosen === 0
            ? "The time for this election has passed. You hadn't chosen any candidates, so there's no ballot to submit."
            : 'The time for this election has passed. Litsamaiso is submitting the choices you made.'
        }
        footer={
          chosen === 0 ? (
            <Button onClick={() => navigate('/elections', { replace: true })}>Back to elections</Button>
          ) : closingError ? (
            <>
              <Button variant="secondary" onClick={() => navigate('/elections', { replace: true })}>
                Back to elections
              </Button>
              <Button onClick={submitClosingBallotNow}>Try again</Button>
            </>
          ) : (
            <Button loading={submitting} disabled={secondsLeft === null} onClick={submitClosingBallotNow}>
              Submit now
            </Button>
          )
        }
      >
        {chosen > 0 && (
          <div className="text-center" aria-live="polite">
            {closingError ? (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{closingError}</p>
            ) : secondsLeft !== null ? (
              <>
                <p className="text-4xl font-bold text-primary-clr">{secondsLeft}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Submitting your ballot in {secondsLeft} second{secondsLeft === 1 ? '' : 's'}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Submitting your ballot...</p>
            )}
            <p className="mt-3 text-xs text-slate-400">
              {chosen} of {positions.length} chosen
              {skipped > 0 && ` · ${skipped} skipped`}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={reviewing && !votingClosed}
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
        {skipped > 0 && (
          <p className="mb-3 rounded-2xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
            You're skipping {skipped} position{skipped === 1 ? '' : 's'}. You won't be able to vote for{' '}
            {skipped === 1 ? 'it' : 'them'} later.
          </p>
        )}
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {positions.map((position) => {
            const candidate = position.candidates.find((c) => c._id === selected[position._id as string]);
            return (
              <li key={position._id} className="flex items-center gap-3 px-4 py-3">
                {candidate ? (
                  <Avatar name={getCandidateName(candidate)} imageUrl={candidate.imageUrl} size="sm" />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-full border-2 border-dashed border-slate-200" />
                )}
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{getPositionTitle(position)}</p>
                  <p className={cn('truncate text-sm font-semibold', candidate ? 'text-primary-clr' : 'italic text-slate-400')}>
                    {candidate ? getCandidateName(candidate) : 'Skipped'}
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
