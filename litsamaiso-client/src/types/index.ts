// User and Authentication Types
export interface User {
  _id?: string;
  id: string;
  name?: string;
  email: string;
  role: Role;
  institution?: Institution;
  studentId?: string;
  studentCardUrl?: string;
  faceDescriptor?: number[];
  faceImageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Role {
  _id: string;
  name: 'Student' | 'InstitutionAdmin' | 'AppAdmin' | 'Finance' | 'SAAD';
  permissions?: string[];
}

export interface Institution {
  _id: string;
  name: string;
  email: string;
  address?: string;
  phone?: string;
  website?: string;
  locked?: boolean;
  lockedAt?: string;
  lockedReason?: string;
  createdAt?: string;
}

export interface AuthResponse {
  message: string;
  token?: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  studentId?: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: 'Student' | 'InstitutionAdmin';
  institutionId?: string;
  institutionName?: string;
  institutionEmail?: string;
  studentId?: string;
  faceImageBase64?: string;
  faceDescriptor?: number[];
  faceImageUrl?: string;
}

// Election Types
export interface Candidate {
  _id?: string;
  name?: string;
  description?: string;
  fullName?: string;
  party?: string;
  manifesto?: string;
  studentId?: string;
  imageUrl?: string;
  approved?: boolean;
  disqualified?: boolean;
}

export interface Position {
  _id?: string;
  name?: string;
  title?: string;
  description?: string;
  candidates?: Candidate[];
  maxVotes?: number;
  maxVotesAllowed?: number;
  displayOrder?: number;
}

export interface CandidateImportWarning {
  rowNumber?: number;
  column?: string;
  message: string;
}

export interface CandidateImportSummary {
  rowsRead: number;
  parsedCandidates: number;
  importedCandidates: number;
  skippedCandidates: number;
  warnings: CandidateImportWarning[];
  mappedColumns: Array<{
    position: string;
    columns: Partial<Record<'candidate' | 'studentId' | 'party' | 'manifesto' | 'imageUrl' | 'approved', string>>;
  }>;
}

export interface CandidateImportResult {
  summary: CandidateImportSummary;
  candidates: Candidate[];
}

export interface Election {
  _id: string;
  title: string;
  description?: string;
  institution: Institution;
  positions?: Position[];
  academicYear?: string;
  status?: 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'COUNTING' | 'RESULTS_PUBLISHED' | 'ARCHIVED';
  startTime?: string;
  endTime?: string;
  timezone?: string;
  published?: boolean;
  archived?: boolean;
  resultsPublished?: boolean;
  createdBy?: User;
  createdAt?: string;
  updatedAt?: string;
}

export interface Vote {
  _id?: string;
  election: string;
  student: string;
  position: string;
  candidate: string;
  timestamp?: string;
}

export interface ResultRanking {
  candidateId: string;
  votes: number;
  percentage: number;
  rank: number;
}

export interface ResultPositionSnapshot {
  positionId: string;
  winnerId?: string | null;
  rankings: ResultRanking[];
}

export interface ResultSnapshot {
  electionId: string;
  generatedAt: string;
  positions: ResultPositionSnapshot[];
  snapshotHash: string;
}

export interface ResultPositionDetail {
  generatedAt: string;
  positionId: string;
  positionTitle?: string;
  rankings: Array<{
    candidateId: string;
    candidateName?: string;
    votes: number;
    percentage: number;
    rank: number;
  }>;
}

// Account and Confirmation Types
export interface Account {
  _id: string;
  fullnames: string;
  contractNumber: string;
  accountNumber?: string;
  bankName?: string;
  batchNumber?: number;
  courseOfStudy: string;
  graduating?: boolean;
  status: 'pending' | 'undefined' | 'confirmed' | 'erroneous' | 'paid';
  student?: User;
  institution: Institution;
  issues?: Issue[];
  paidDate?: string;
  paidAt?: string;
  confirmationDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Issue {
  _id: string;
  account: string;
  fieldName: string;
  extractedValue: string;
  correctedValue?: string;
  status: 'reported' | 'resolved';
  createdAt?: string;
  updatedAt?: string;
}

// Audit Log Types
export interface AuditLog {
  _id: string;
  action: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  targetCollection?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogsResponse {
  auditLogs: AuditLog[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Pagination Types
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// API Error Type
export interface ApiError {
  message: string;
  status: number;
  details?: unknown;
}
