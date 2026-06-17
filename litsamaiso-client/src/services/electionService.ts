import apiClient from '../lib/api';
import type { Election, Position, Candidate, CandidateImportResult, ResultPositionDetail, ResultSnapshot, Vote } from '../types';

const noCacheRequest = (params?: Record<string, unknown>) => ({
  params: { ...(params || {}), _: Date.now() },
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

export const electionService = {
  // Get all active elections for the current institution
  getElections: async () => {
    const response = await apiClient.get<{ elections: Election[] }>('/elections', noCacheRequest());
    return response.data.elections;
  },

  // Get a specific election by ID
  getElection: async (electionId: string) => {
    const response = await apiClient.get<{ election: Election }>(
      `/elections/${electionId}`,
      noCacheRequest()
    );
    return response.data.election;
  },

  // Create a new election (admin only)
  createElection: async (electionData: Partial<Election>) => {
    const response = await apiClient.post<{ election: Election }>('/elections', electionData);
    return response.data.election;
  },

  // Update election
  updateElection: async (electionId: string, data: Partial<Election>) => {
    const response = await apiClient.patch<{ election: Election }>(`/elections/${electionId}`, data);
    return response.data.election;
  },

  // Delete election
  deleteElection: async (electionId: string) => {
    await apiClient.delete(`/elections/${electionId}`);
  },

  scheduleElection: async (
    electionId: string,
    data: { startTime: string; endTime: string; timezone: string }
  ) => {
    const response = await apiClient.post<{ election: Election }>(
      `/elections/${electionId}/schedule`,
      data
    );
    return response.data.election;
  },

  publishElection: async (
    electionId: string,
    data: { startTime?: string; endTime?: string; timezone?: string }
  ) => {
    const response = await apiClient.post<{ election: Election }>(
      `/elections/${electionId}/publish`,
      data
    );
    return response.data.election;
  },

  archiveElection: async (electionId: string) => {
    const response = await apiClient.post<{ election: Election }>(
      `/elections/${electionId}/archive`
    );
    return response.data.election;
  },

  publishResults: async (electionId: string) => {
    const response = await apiClient.post<{ election: Election }>(
      `/elections/${electionId}/publish-results`
    );
    return response.data.election;
  },

  // Add position to election
  addPosition: async (electionId: string, position: Position) => {
    const response = await apiClient.post<{ position: Position }>(
      `/elections/${electionId}/positions`,
      position
    );
    return response.data.position;
  },

  getPositions: async (electionId: string) => {
    const response = await apiClient.get<{ positions: Position[] }>(
      `/elections/${electionId}/positions`,
      noCacheRequest()
    );
    return response.data.positions;
  },

  // Add candidate to position
  addCandidate: async (
    electionId: string,
    positionId: string,
    candidate: Candidate | FormData
  ) => {
    const response = await apiClient.post<{ candidate: Candidate }>(
      `/elections/${electionId}/positions/${positionId}/candidates`,
      candidate,
      candidate instanceof FormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } }
        : undefined
    );
    return response.data.candidate;
  },

  updateCandidate: async (candidateId: string, candidate: Partial<Candidate> | FormData) => {
    const response = await apiClient.patch<{ candidate: Candidate }>(
      `/elections/candidates/${candidateId}`,
      candidate,
      candidate instanceof FormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } }
        : undefined
    );
    return response.data.candidate;
  },

  approveCandidate: async (candidateId: string) => {
    const response = await apiClient.post<{ candidate: Candidate }>(
      `/elections/candidates/${candidateId}/approve`
    );
    return response.data.candidate;
  },

  disqualifyCandidate: async (candidateId: string) => {
    const response = await apiClient.post<{ candidate: Candidate }>(
      `/elections/candidates/${candidateId}/disqualify`
    );
    return response.data.candidate;
  },

  getCandidates: async (positionId: string) => {
    const response = await apiClient.get<{ candidates: Candidate[] }>(
      `/elections/positions/${positionId}/candidates`,
      noCacheRequest()
    );
    return response.data.candidates;
  },

  importCandidates: async (
    electionId: string,
    file: File,
    options?: { approveImported?: boolean }
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.approveImported) {
      formData.append('approveImported', 'true');
    }

    const response = await apiClient.post<CandidateImportResult>(
      `/elections/${electionId}/candidates/import`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  // Cast a vote
  castVote: async (electionId: string, vote: Vote | { selections: Array<{ positionId: string; candidateId: string }>; idempotencyKey: string }) => {
    const response = await apiClient.post(`/elections/${electionId}/vote`, vote);
    return response.data;
  },

  // Get election results
  getResults: async (electionId: string) => {
    const response = await apiClient.get<{ snapshot: ResultSnapshot }>(
      `/elections/${electionId}/results`,
      noCacheRequest()
    );
    return response.data.snapshot;
  },

  recomputeResults: async (electionId: string) => {
    const response = await apiClient.post<{ snapshot: ResultSnapshot }>(
      `/elections/${electionId}/results/recompute`
    );
    return response.data.snapshot;
  },

  getResultsByPosition: async (electionId: string, positionId: string) => {
    const response = await apiClient.get<{ position: ResultPositionDetail }>(
      `/elections/${electionId}/results/positions/${positionId}`,
      noCacheRequest()
    );
    return response.data.position;
  },

  getVoteStatus: async (electionId: string) => {
    const response = await apiClient.get<{
      status: { hasVoted: boolean; receiptId?: string; submittedAt?: string };
    }>('/vote/status', noCacheRequest({ electionId }));
    return response.data.status;
  },

  // Check if user has voted in election
  hasVoted: async (electionId: string) => {
    const status = await electionService.getVoteStatus(electionId);
    return status.hasVoted;
  },
};
