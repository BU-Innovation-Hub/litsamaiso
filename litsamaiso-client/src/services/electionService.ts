import apiClient from '../lib/api';
import type { Election, Position, Candidate, CandidateImportResult, ResultPositionDetail, ResultSnapshot, ScheduleReadiness, VoteReceipt } from '../types';

const noCacheRequest = (params?: Record<string, unknown>) => ({
  params: { ...(params || {}), _: Date.now() },
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

export const electionService = {
  // Get all active elections for the current institution
  getElections: async (params?: { page?: number; limit?: number }) => {
    const { elections } = await electionService.getElectionsWithServerTime(params);
    return elections;
  },

  // Same as getElections, plus the server's clock so the UI doesn't trust the device clock
  getElectionsWithServerTime: async (params?: { page?: number; limit?: number }) => {
    const response = await apiClient.get<{ elections: Election[]; serverTime: string }>(
      '/elections',
      noCacheRequest(params)
    );
    return response.data;
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

  getScheduleReadiness: async (electionId: string) => {
    const response = await apiClient.get<{ readiness: ScheduleReadiness }>(
      `/elections/${electionId}/readiness`,
      noCacheRequest()
    );
    return response.data.readiness;
  },

  closeElection: async (electionId: string) => {
    const response = await apiClient.post<{ election: Election }>(`/elections/${electionId}/close`);
    return response.data.election;
  },

  extendElection: async (electionId: string, endTime: string) => {
    const response = await apiClient.post<{ election: Election }>(
      `/elections/${electionId}/extend`,
      { endTime }
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

  // Institution-level standard positions, copied onto each new election
  getPositionTemplates: async () => {
    const response = await apiClient.get<{ templates: Position[] }>(
      '/elections/position-templates',
      noCacheRequest()
    );
    return response.data.templates;
  },

  importSrcPositionTemplates: async () => {
    const response = await apiClient.post<{ created: number; templates: Position[] }>(
      '/elections/position-templates/import'
    );
    return response.data;
  },

  deletePosition: async (positionId: string) => {
    await apiClient.delete(`/elections/positions/${positionId}`);
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

  deleteCandidate: async (candidateId: string) => {
    await apiClient.delete(`/elections/candidates/${candidateId}`);
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
  castVote: async (
    electionId: string,
    vote: { selections: Array<{ positionId: string; candidateId: string }>; idempotencyKey: string }
  ) => {
    const response = await apiClient.post<{ receipt: VoteReceipt }>(
      `/elections/${electionId}/vote`,
      { selections: vote.selections },
      { headers: { 'Idempotency-Key': vote.idempotencyKey } }
    );
    return response.data.receipt;
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
