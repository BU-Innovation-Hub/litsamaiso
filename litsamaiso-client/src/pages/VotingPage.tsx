import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { electionService } from '../services/electionService';
import type { Candidate, Election, Position } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

type PositionWithCandidates = Position & { candidates: Candidate[] };

const getPositionTitle = (position: Position) => position.title || position.name || 'Position';
const getCandidateName = (candidate: Candidate) => candidate.fullName || candidate.name || 'Candidate';
const canSkipPosition = (position: PositionWithCandidates) => position.candidates.length <= 1;

const getBallotUnavailableMessage = (election: Election) => {
  const now = Date.now();
  const startTime = election.startTime ? new Date(election.startTime).getTime() : null;
  const endTime = election.endTime ? new Date(election.endTime).getTime() : null;

  if (startTime && now < startTime) {
    return `This ballot opens on ${new Date(startTime).toLocaleString()}.`;
  }

  if (endTime && now >= endTime) {
    return election.resultsPublished
      ? 'Voting has ended and the results have been published.'
      : 'Voting has ended and the election results are being reviewed.';
  }

  if (election.status !== 'OPEN') {
    return 'This ballot is not open yet.';
  }

  return '';
};

const VotingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<PositionWithCandidates[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
        setPositions(positionsWithCandidates);
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
    const missing = positions.filter((position) => (
      position._id && !selectedCandidates[position._id] && !canSkipPosition(position)
    ));

    if (missing.length > 0) {
      toast.error(`Please select candidates for: ${missing.map(getPositionTitle).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      await electionService.castVote(id, {
        selections: positions
          .filter((position) => position._id && selectedCandidates[position._id])
          .map((position) => ({
            positionId: position._id as string,
            candidateId: selectedCandidates[position._id as string],
          })),
        idempotencyKey: `vote-${id}-${Date.now()}`,
      });
      navigate('/elections', {
        replace: true,
        state: {
          electionCompletedMessage: `You have completed the election for ${election?.academicYear || 'this year'}.`,
        },
      });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to submit votes'));
    } finally {
      setSubmitting(false);
    }
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
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {position.candidates.length === 0 ? (
                      <p className="text-sm text-gray-500">No candidates available for this position.</p>
                    ) : (
                      position.candidates.map((candidate) => (
                        <button
                          key={candidate._id || getCandidateName(candidate)}
                          onClick={() => position._id && candidate._id && setSelectedCandidates((prev) => {
                            const positionId = position._id as string;
                            if (prev[positionId] === candidate._id) {
                              const next = { ...prev };
                              delete next[positionId];
                              return next;
                            }

                            return { ...prev, [positionId]: candidate._id as string };
                          })}
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
                      ))
                    )}
                  </div>
                  {canSkipPosition(position) && (
                    <p className="mt-4 text-sm text-gray-500">
                      You may leave this position unselected if you do not want to vote for this candidate.
                    </p>
                  )}
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
                        {selected ? getCandidateName(selected) : canSkipPosition(position) ? 'No vote' : 'Not selected'}
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
