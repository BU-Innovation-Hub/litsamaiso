import { Types } from "mongoose";
import { Election, type ElectionDocument, type ElectionStatus } from "../models/Election.js";
import { Position } from "../models/Position.js";
import { Candidate } from "../models/Candidate.js";
import { ResultSnapshot } from "../models/ResultSnapshot.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { requireDate, requireString, optionalString } from "../utils/validation.js";
import { scheduleElectionJobs, scheduleCountJob } from "./electionScheduler.js";

const ensureEditable = (election: ElectionDocument): void => {
  if (["OPEN", "CLOSED", "COUNTING", "RESULTS_PUBLISHED", "ARCHIVED"].includes(election.status)) {
    throw new AppError("Election is frozen and cannot be edited", 400);
  }
};

const assertStatus = (election: ElectionDocument, allowed: ElectionStatus[]): void => {
  if (!allowed.includes(election.status)) {
    throw new AppError(`Election status must be one of ${allowed.join(", ")}`, 400);
  }
};
// Service functions for managing elections, including creating, updating, scheduling, publishing, closing, archiving, and publishing results.
export const createElection = async (params: {
  user: any;
  title: unknown;
  description?: unknown;
  academicYear?: unknown;
  timezone?: unknown;
  votingRules?: Record<string, unknown>;
  securitySettings?: Record<string, unknown>;
}): Promise<ElectionDocument> => {
  const title = requireString(params.title, "title", { min: 3 });
  const description = optionalString(params.description);
  const academicYear = optionalString(params.academicYear);
  const timezone = optionalString(params.timezone) || "UTC";

  const payload: Partial<ElectionDocument> = {
    title,
    ...(description !== undefined && { description }),
    ...(academicYear !== undefined && { academicYear }),
    timezone,
    createdBy: new Types.ObjectId(params.user._id),
    institution: new Types.ObjectId(params.user.institution),
    status: "DRAFT",
    published: false,
    archived: false,
    resultsPublished: false,
    votingRules: params.votingRules || {},
    securitySettings: params.securitySettings || {},
  };

  const election = await Election.create(payload);

  await recordAudit({
    action: "election.create",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { title },
  });

  return election;
};
// Service function to count votes and generate a results snapshot for an election, including updating candidate vote counts and recording an audit log of the counting action
export const updateElection = async (params: {
  user: any;
  electionId: string;
  updates: Record<string, unknown>;
}): Promise<ElectionDocument> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election);

  if (params.updates.title !== undefined) {
    election.title = requireString(params.updates.title, "title", { min: 3 });
  }
  if (params.updates.description !== undefined) {
    const v = optionalString(params.updates.description);
    if (v !== undefined) election.description = v;
  }
  if (params.updates.academicYear !== undefined) {
    const v = optionalString(params.updates.academicYear);
    if (v !== undefined) election.academicYear = v;
  }
  if (params.updates.timezone !== undefined) {
    const v = optionalString(params.updates.timezone);
    if (v !== undefined) election.timezone = v;
  }
  if (params.updates.votingRules !== undefined) {
    election.votingRules = params.updates.votingRules as Record<string, unknown>;
  }
  if (params.updates.securitySettings !== undefined) {
    election.securitySettings =
      params.updates.securitySettings as Record<string, unknown>;
  }

  await election.save();

  await recordAudit({
    action: "election.update",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { updates: Object.keys(params.updates) },
  });

  return election;
};
// Service function to count votes and generate a results snapshot for an election, including updating candidate vote counts and recording an audit log of the counting action
export const scheduleElection = async (params: {
  user: any;
  electionId: string;
  startTime: unknown;
  endTime: unknown;
  timezone?: unknown;
}): Promise<ElectionDocument> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election);

  const startTime = requireDate(params.startTime, "startTime");
  const endTime = requireDate(params.endTime, "endTime");
  if (endTime <= startTime) {
    throw new AppError("endTime must be after startTime", 400);
  }

  election.startTime = startTime;
  election.endTime = endTime;
  election.timezone = optionalString(params.timezone) || election.timezone || "UTC";
  election.status = "SCHEDULED";
  election.published = true;

  await election.save();

  await scheduleElectionJobs({
    electionId: election._id.toString(),
    startTime,
    endTime,
  });

  await recordAudit({
    action: "election.schedule",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { startTime: startTime.toISOString(), endTime: endTime.toISOString() },
  });

  return election;
};
// Service function to count votes and generate a results snapshot for an election, including updating candidate vote counts and recording an audit log of the counting action
export const publishElection = async (params: {
  user: any;
  electionId: string;
  startTime?: unknown;
  endTime?: unknown;
  timezone?: unknown;
}): Promise<ElectionDocument> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election);

  if (params.startTime !== undefined || params.endTime !== undefined) {
    return scheduleElection({
      user: params.user,
      electionId: params.electionId,
      startTime: params.startTime,
      endTime: params.endTime,
      timezone: params.timezone,
    });
  }

  election.published = true;
  if (election.status === "DRAFT") {
    election.status = "DRAFT";
  }

  await election.save();

  await recordAudit({
    action: "election.publish",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Election",
    targetId: election._id?.toString(),
  });

  return election;
};
// Service function to count votes and generate a results snapshot for an election, including updating candidate vote counts and recording an audit log of the counting action
export const openElectionByJob = async (electionId: string): Promise<void> => {
  const election = await Election.findOne({ _id: electionId, deletedAt: null });
  if (!election) return;
  if (election.status === "OPEN") return;

  const now = new Date();
  if (election.startTime && now < election.startTime) return;
  if (election.endTime && now >= election.endTime) return;

  assertStatus(election, ["SCHEDULED", "DRAFT"]);
  election.status = "OPEN";
  await election.save();

  await recordAudit({
    action: "election.open",
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { source: "job" },
  });
};
// Service function to count votes and generate a results snapshot for an election, including updating candidate vote counts and recording an audit log of the counting action
export const closeElectionByJob = async (electionId: string): Promise<void> => {
  const election = await Election.findOne({ _id: electionId, deletedAt: null });
  if (!election) return;
  if (election.status === "CLOSED" || election.status === "COUNTING" || election.status === "RESULTS_PUBLISHED") {
    return;
  }

  const now = new Date();
  if (election.endTime && now < election.endTime) return;

  assertStatus(election, ["OPEN", "SCHEDULED"]);
  election.status = "CLOSED";
  await election.save();

  await recordAudit({
    action: "election.close",
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { source: "job" },
  });

  await scheduleCountJob(election._id.toString());
};
// Service function to count votes and generate a results snapshot for an election, including updating candidate vote counts and recording an audit log of the counting action
export const archiveElection = async (params: {
  user: any;
  electionId: string;
}): Promise<ElectionDocument> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  if (election.status !== "RESULTS_PUBLISHED" && election.status !== "CLOSED") {
    throw new AppError("Only closed elections can be archived", 400);
  }

  election.archived = true;
  election.status = "ARCHIVED";
  await election.save();

  await recordAudit({
    action: "election.archive",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Election",
    targetId: election._id?.toString(),
  });

  return election;
};
// Service function to count votes and generate a results snapshot for an election, including updating candidate vote counts and recording an audit log of the counting action
export const publishResults = async (params: {
  user: any;
  electionId: string;
}): Promise<ElectionDocument> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  const snapshot = await ResultSnapshot.findOne({ electionId: election._id })
    .sort({ generatedAt: -1 })
    .lean();
  if (!snapshot) {
    throw new AppError("No results snapshot found. Run counting first.", 400);
  }

  election.resultsPublished = true;
  election.status = "RESULTS_PUBLISHED";
  await election.save();

  await recordAudit({
    action: "results.publish",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { snapshotId: snapshot._id?.toString() },
  });

  return election;
};
// Service function to count votes and generate a results snapshot for an election, including updating candidate vote counts and recording an audit log of the counting action
export const softDeleteElection = async (params: {
  user: any;
  electionId: string;
}): Promise<void> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  election.deletedAt = new Date();
  election.deletedBy = new Types.ObjectId(params.user._id);
  await election.save();

  await Position.updateMany(
    { electionId: election._id, deletedAt: null },
    { $set: { deletedAt: new Date(), deletedBy: params.user._id } },
  );

  await Candidate.updateMany(
    { electionId: election._id, deletedAt: null },
    { $set: { deletedAt: new Date(), deletedBy: params.user._id } },
  );

  await recordAudit({
    action: "election.delete",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Election",
    targetId: election._id?.toString(),
  });
};
