import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { electionService } from '../services/electionService';
import type { Candidate, Election, Position } from '../types';
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
      return election.startTime
        ? `This ballot opens on ${new Date(election.startTime).toLocaleString()}.`
        : 'This ballot is not open yet.';
    case 'RESULTS_PUBLISHED':
      return 'Voting has ended and the results have been published.';
    case 'CLOSED':
    case 'COUNTING':
      return 'Voting has ended and the election results are being reviewed.';
    default:
      return 'This ballot is not open yet.';
  }
};

const VotingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<PositionWithCandidates[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
            state: {
              electionCompletedMessage: `You have already completed the election for ${electionData.academicYear || 'this year'}.`,
            },
          });
          return;
        }
        const positionData = await electionService.getPositions(id);
        const positionsWithCandidates = await Promise.all(
          positionData.map(async (position) => ({
            ...position,
            candidates: position._id ? await electionService.getCandidates(position._id) : [],
          }))
        );

        setElection(electionData);
        // Positions without approved candidates aren't on the ballot
        setPositions(positionsWithCandidates.filter((position) => position.candidates.length > 0));
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, 'Failed to load ballot'));
      } finally {
        setLoading(false);
      }
    };

    void loadBallot();
  }, [id, navigate]);

  const handleSubmitVotes = async () => {
    if (!id) return;
    const missing = positions.filter((position) => position._id && !selectedCandidates[position._id]);

    if (missing.length > 0) {
      toast.error(`Please select a candidate for: ${missing.map(getPositionTitle).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const receipt = await electionService.castVote(id, {
        selections: positions.map((position) => ({
          positionId: position._id as string,
          candidateId: selectedCandidates[position._id as string],
        })),
        idempotencyKey,
      });
      navigate('/elections', {
        replace: true,
        state: {
          electionCompletedMessage: `You have completed the election for ${election?.academicYear || 'this year'}.`,
          receipt,
        },
      });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to submit votes'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCandidateSelect = (
    event: React.MouseEvent<HTMLButtonElement>,
    positionId: string,
    candidateId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    setSelectedCandidates((prev) => {
      if (prev[positionId] === candidateId) {
        const next = { ...prev };
        delete next[positionId];
        return next;
      }

      return { ...prev, [positionId]: candidateId };
    });
  };

  return (
    <div className="global-bg min-h-screen pt-32">
      <div className="mx-auto max-w-4xl px-4">
        {loading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">Loading ballot...</div>
        ) : !election ? (
          <div className="rounded-lg bg-red-50 p-8 text-center">
            <p className="font-semibold text-red-600">Election not found</p>
            <Link to="/elections" className="mt-4 inline-block rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white">Return to Elections</Link>
          </div>
        ) : getBallotUnavailableMessage(election) ? (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <h1 className="mb-3 text-3xl font-bold text-gray-900">{election.title}</h1>
            <p className="text-gray-600">{getBallotUnavailableMessage(election)}</p>
            <Link to="/elections" className="mt-6 inline-block rounded-lg bg-button px-8 py-3 font-semibold text-white">Return to Elections</Link>
          </div>
        ) : (
          <>
            <div className="mb-12 text-center">
              <h1 className="mb-3 text-4xl font-bold text-gray-900">{election.title}</h1>
              {election.description && <p className="text-lg text-gray-600">{election.description}</p>}
            </div>

            <div className="space-y-8">
              {positions.map((position) => (
                <div key={position._id || getPositionTitle(position)} className="rounded-xl bg-white p-8 shadow-lg">
                  <div className="mb-6 border-b-2 border-gray-200 pb-4">
                    <h2 className="mb-1 text-2xl font-bold text-gray-900">{getPositionTitle(position)}</h2>
                    {position.description && <p className="text-gray-600">{position.description}</p>}
                    <p className="mt-1 text-sm text-gray-500">Choose one candidate.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {position.candidates.map((candidate) => (
                        <button
                          key={candidate._id || getCandidateName(candidate)}
                          onClick={(event) => {
                            if (position._id && candidate._id) {
                              handleCandidateSelect(event, position._id, candidate._id);
                            }
                          }}
                          className={`rounded-lg border-2 p-4 text-left transition-all ${
                            position._id && selectedCandidates[position._id] === candidate._id
                              ? 'border-blue-600 bg-blue-50 shadow-md'
                              : 'border-gray-200 bg-white hover:border-blue-300'
                          }`}
                          type="button"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                              position._id && selectedCandidates[position._id] === candidate._id
                                ? 'border-blue-600 bg-blue-600'
                                : 'border-gray-300 bg-white'
                            }`}>
                              {position._id && selectedCandidates[position._id] === candidate._id && <span className="text-sm text-white">✓</span>}
                            </div>
                            <div>
                              <h3 className="mb-1 font-bold text-gray-900">{getCandidateName(candidate)}</h3>
                              {(candidate.party || candidate.manifesto || candidate.description) && (
                                <p className="text-sm text-gray-600">{candidate.party || candidate.manifesto || candidate.description}</p>
                              )}
                            </div>
                          </div>
                        </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 rounded-xl bg-white p-8 shadow-lg">
              <h3 className="mb-4 text-xl font-bold text-gray-900">Your Selections:</h3>
              <div className="mb-8 space-y-2 border-b-2 border-gray-200 pb-8">
                {positions.map((position) => {
                  const selected = position.candidates.find((candidate) => candidate._id === selectedCandidates[position._id || '']);
                  return (
                    <div key={position._id || getPositionTitle(position)} className="flex items-center justify-between">
                      <span className="font-medium text-gray-700">{getPositionTitle(position)}:</span>
                      <span className={`font-semibold ${selected ? 'text-green-600' : 'text-red-600'}`}>
                        {selected ? getCandidateName(selected) : 'Not selected'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleSubmitVotes}
                disabled={submitting || positions.length === 0}
                className="w-full rounded-lg bg-button py-4 text-lg font-semibold text-white disabled:opacity-50"
                type="button"
              >
                {submitting ? 'Submitting Votes...' : 'Submit Your Votes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VotingPage;
