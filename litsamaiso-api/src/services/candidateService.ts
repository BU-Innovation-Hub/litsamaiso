import { Types } from "mongoose";
import { Election } from "../models/Election.js";
import { Position } from "../models/Position.js";
import { Candidate, type CandidateDocument } from "../models/Candidate.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { optionalString, requireString } from "../utils/validation.js";

const ensureEditable = (status: string): void => {
  if (["OPEN", "CLOSED", "COUNTING", "RESULTS_PUBLISHED", "ARCHIVED"].includes(status)) {
    throw new AppError("Election is frozen and candidates cannot be edited", 400);
  }
};
/* Service functions for managing candidates, including creating, updating, approving,
 disqualifying, and listing candidates for positions within an election. 
 These functions also include necessary checks for election status and user
  permissions, as well as audit logging for changes made to candidates.*/
export const createCandidate = async (params: {
  user: any;
  electionId: string;
  positionId: string;
  fullName: unknown;
  party?: unknown;
  manifesto?: unknown;
  studentId?: unknown;
  imageUrl?: string;
}): Promise<CandidateDocument> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election.status);

  const position = await Position.findOne({
    _id: params.positionId,
    electionId: election._id,
    deletedAt: null,
  });
  if (!position) throw new AppError("Position not found", 404);

  const party = optionalString(params.party);
  const manifesto = optionalString(params.manifesto);
  const studentId = optionalString(params.studentId);

  const candidate = await Candidate.create({
    electionId: election._id,
    positionId: position._id,
    fullName: requireString(params.fullName, "fullName", { min: 3 }),
    ...(party !== undefined && { party }),
    ...(manifesto !== undefined && { manifesto }),
    ...(studentId !== undefined && { studentId }),
    ...(params.imageUrl !== undefined && { imageUrl: params.imageUrl }),
    approved: false,
    disqualified: false,
  });

  await recordAudit({
    action: "candidate.create",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Candidate",
    targetId: (candidate as any)._id?.toString(),
    details: { electionId: election._id?.toString(), positionId: position._id?.toString() },
  });

  return candidate;
};
// Service function to update candidate details, including optional image upload and approval/disqualification status changes
export const updateCandidate = async (params: {
  user: any;
  candidateId: string;
  updates: Record<string, unknown>;
}): Promise<CandidateDocument> => {
  const candidate = await Candidate.findOne({
    _id: params.candidateId,
    deletedAt: null,
  });
  if (!candidate) throw new AppError("Candidate not found", 404);

  const election = await Election.findOne({
    _id: candidate.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election.status);

  if (params.updates.fullName !== undefined) {
    candidate.fullName = requireString(params.updates.fullName, "fullName", { min: 3 });
  }
  if (params.updates.party !== undefined) {
    const v = optionalString(params.updates.party);
    if (v !== undefined) candidate.party = v;
  }
  if (params.updates.manifesto !== undefined) {
    const v = optionalString(params.updates.manifesto);
    if (v !== undefined) candidate.manifesto = v;
  }
  if (params.updates.imageUrl !== undefined) {
    const v = optionalString(params.updates.imageUrl);
    if (v !== undefined) candidate.imageUrl = v;
  }
  if (params.updates.approved !== undefined) {
    candidate.approved = Boolean(params.updates.approved);
  }
  if (params.updates.disqualified !== undefined) {
    candidate.disqualified = Boolean(params.updates.disqualified);
  }

  await candidate.save();

  await recordAudit({
    action: "candidate.update",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Candidate",
    targetId: candidate._id?.toString(),
    details: { updates: Object.keys(params.updates) },
  });

  return candidate;
};
// Service function to soft delete a candidate, marking them as deleted without removing from the database
export const softDeleteCandidate = async (params: {
  user: any;
  candidateId: string;
}): Promise<void> => {
  const candidate = await Candidate.findOne({
    _id: params.candidateId,
    deletedAt: null,
  });
  if (!candidate) throw new AppError("Candidate not found", 404);

  const election = await Election.findOne({
    _id: candidate.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election.status);

  candidate.deletedAt = new Date();
  candidate.deletedBy = new Types.ObjectId(params.user._id);
  await candidate.save();

  await recordAudit({
    action: "candidate.delete",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Candidate",
    targetId: candidate._id?.toString(),
  });
};

const resolveRoleName = (user: any): string => {
  const resolved =
    (user?.role && (user.role as any).name) || (user?.role as string) || "";
  return String(resolved).toLowerCase();
};

const ensureStudentCanView = (election: { published?: boolean; archived?: boolean }): void => {
  if (!election.published || election.archived) {
    throw new AppError("Election is not available", 403);
  }
};
// Service function to list candidates for a specific position, with visibility based on user role and election status
export const listCandidatesByPosition = async (params: {
  user: any;
  positionId: string;
}): Promise<CandidateDocument[]> => {
  const position = await Position.findOne({
    _id: params.positionId,
    deletedAt: null,
  }).lean();
  if (!position) throw new AppError("Position not found", 404);

  const election = await Election.findOne({
    _id: position.electionId,
    deletedAt: null,
    institution: params.user.institution,
  }).lean();
  if (!election) throw new AppError("Election not found", 404);

  const roleName = resolveRoleName(params.user);
  if (roleName === "student") {
    ensureStudentCanView(election);
  }

  const filter: Record<string, unknown> = {
    positionId: position._id,
    electionId: election._id,
    deletedAt: null,
  };
  if (roleName === "student") {
    filter.approved = true;
    filter.disqualified = false;
  }

  return Candidate.find(filter).sort({ fullName: 1 }).lean();
};
// Service function to approve a candidate, marking them as approved and not disqualified
export const approveCandidate = async (params: {
  user: any;
  candidateId: string;
}): Promise<CandidateDocument> => {
  const candidate = await Candidate.findOne({
    _id: params.candidateId,
    deletedAt: null,
  });
  if (!candidate) throw new AppError("Candidate not found", 404);

  const election = await Election.findOne({
    _id: candidate.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election.status);

  candidate.approved = true;
  candidate.disqualified = false;
  await candidate.save();

  await recordAudit({
    action: "candidate.approve",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Candidate",
    targetId: candidate._id?.toString(),
  });

  return candidate;
};
// Service function to disqualify a candidate, marking them as disqualified and not approved
export const disqualifyCandidate = async (params: {
  user: any;
  candidateId: string;
}): Promise<CandidateDocument> => {
  const candidate = await Candidate.findOne({
    _id: params.candidateId,
    deletedAt: null,
  });
  if (!candidate) throw new AppError("Candidate not found", 404);

  const election = await Election.findOne({
    _id: candidate.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election.status);

  candidate.disqualified = true;
  candidate.approved = false;
  await candidate.save();

  await recordAudit({
    action: "candidate.disqualify",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Candidate",
    targetId: candidate._id?.toString(),
  });

  return candidate;
};
