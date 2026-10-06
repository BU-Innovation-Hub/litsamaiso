import { Types } from "mongoose";
import { Election, type ElectionDocument, type ElectionStatus } from "../models/Election.js";
import { Position } from "../models/Position.js";
import { Candidate } from "../models/Candidate.js";
import { ResultSnapshot } from "../models/ResultSnapshot.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { requireDate, requireString, optionalString } from "../utils/validation.js";
import { SRC_POSITION_TEMPLATES } from "../constants/srcPositions.js";
import {
  cancelElectionJobs,
  rescheduleCloseJob,
  scheduleElectionJobs,
  scheduleCountJob,
} from "./electionScheduler.js";
import { copyPositionTemplatesToElection } from "./positionTemplateService.js";

const ensureEditable = (election: ElectionDocument): void => {
  if (["OPEN", "CLOSED", "COUNTING", "RESULTS_PUBLISHED", "ARCHIVED"].includes(election.status)) {
    throw new AppError("Election is frozen and cannot be edited", 400);
  }
};

const DELETABLE_STATUSES: ElectionStatus[] = ["DRAFT", "SCHEDULED"];

const actorFields = (user: any) => ({
  actorId: user?._id?.toString(),
  actorEmail: user?.email,
  actorRole: (user?.role && (user.role as any).name) || user?.role,
});

const findInstitutionElection = async (user: any, electionId: string) => {
  const election = await Election.findOne({
    _id: electionId,
    deletedAt: null,
    institution: user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);
  return election;
};
// Service function to create a draft election and copy the institution's standard positions onto it
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
  await copyPositionTemplatesToElection({
    institution: election.institution,
    electionId: election._id,
  });

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
// Service function to update an editable election's details and record the change in the audit log
export const updateElection = async (params: {
  user: any;
  electionId: string;
  updates: Record<string, unknown>;
}): Promise<ElectionDocument> => {
  const election = await findInstitutionElection(params.user, params.electionId);

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
    ...actorFields(params.user),
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { updates: Object.keys(params.updates) },
  });

  return election;
};

export type ScheduleReadiness = {
  positionCount: number;
  standardPositionCount: number;
  approvedCandidateCount: number;
  positionsWithoutCandidates: string[];
  blockers: string[];
};

// Service function to check whether an election has the positions and candidates it needs before it can be scheduled
export const getScheduleReadiness = async (params: {
  user: any;
  electionId: string;
}): Promise<ScheduleReadiness> => {
  const election = await findInstitutionElection(params.user, params.electionId);

  const [positions, candidates] = await Promise.all([
    Position.find({ electionId: election._id, deletedAt: null, isActive: true })
      .sort({ displayOrder: 1 })
      .select("_id title")
      .lean(),
    Candidate.find({
      electionId: election._id,
      deletedAt: null,
      approved: true,
      disqualified: false,
    })
      .select("positionId")
      .lean(),
  ]);

  const positionsWithCandidates = new Set(candidates.map((c) => c.positionId.toString()));
  const blockers: string[] = [];
  if (positions.length === 0) blockers.push("The election has no positions.");
  if (candidates.length === 0) blockers.push("The election has no approved candidates.");

  return {
    positionCount: positions.length,
    standardPositionCount: SRC_POSITION_TEMPLATES.length,
    approvedCandidateCount: candidates.length,
    positionsWithoutCandidates: positions
      .filter((p) => !positionsWithCandidates.has(p._id.toString()))
      .map((p) => p.title),
    blockers,
  };
};

// Service function to set an election's voting window, make it visible to students and queue the open/close jobs
export const scheduleElection = async (params: {
  user: any;
  electionId: string;
  startTime: unknown;
  endTime: unknown;
  timezone?: unknown;
}): Promise<ElectionDocument> => {
  const election = await findInstitutionElection(params.user, params.electionId);

  ensureEditable(election);

  const startTime = requireDate(params.startTime, "startTime");
  const endTime = requireDate(params.endTime, "endTime");
  if (endTime <= startTime) {
    throw new AppError("endTime must be after startTime", 400);
  }
  if (endTime <= new Date()) {
    throw new AppError("endTime must be in the future", 400);
  }

  const readiness = await getScheduleReadiness({
    user: params.user,
    electionId: params.electionId,
  });
  if (readiness.blockers.length > 0) {
    throw new AppError(`Election cannot be scheduled: ${readiness.blockers.join(" ")}`, 400);
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
    ...actorFields(params.user),
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { startTime: startTime.toISOString(), endTime: endTime.toISOString() },
  });

  return election;
};

// Opens a scheduled election once its start time has passed; safe to call repeatedly or late
export const openElectionByJob = async (electionId: string): Promise<void> => {
  const now = new Date();
  const opened = await Election.findOneAndUpdate(
    {
      _id: electionId,
      deletedAt: null,
      status: "SCHEDULED",
      startTime: { $lte: now },
      endTime: { $gt: now },
    },
    { $set: { status: "OPEN" } },
  );
  if (!opened) return;

  await recordAudit({
    action: "election.open",
    targetCollection: "Election",
    targetId: electionId,
    details: { source: "job" },
  });
};

// Closes an election once its end time has passed and queues counting; safe to call repeatedly or late
export const closeElectionByJob = async (electionId: string): Promise<void> => {
  const now = new Date();
  const closed = await Election.findOneAndUpdate(
    {
      _id: electionId,
      deletedAt: null,
      status: { $in: ["SCHEDULED", "OPEN"] },
      endTime: { $lte: now },
    },
    { $set: { status: "CLOSED" } },
  );
  if (!closed) return;

  await recordAudit({
    action: "election.close",
    targetCollection: "Election",
    targetId: electionId,
    details: { source: "job" },
  });

  await scheduleCountJob(electionId);
};

// Brings elections whose start or end time has passed up to date, in case a scheduled job ran late or not at all
export const syncDueElections = async (
  scope: { institution?: unknown; electionId?: string } = {},
): Promise<void> => {
  const now = new Date();
  const filter: Record<string, unknown> = { deletedAt: null };
  if (scope.institution) filter.institution = scope.institution;
  if (scope.electionId) filter._id = scope.electionId;

  const due = await Election.find({
    ...filter,
    $or: [
      { status: "SCHEDULED", startTime: { $lte: now } },
      { status: { $in: ["SCHEDULED", "OPEN"] }, endTime: { $lte: now } },
    ],
  })
    .select("_id")
    .lean();

  for (const election of due) {
    const id = election._id.toString();
    await openElectionByJob(id);
    await closeElectionByJob(id);
  }
};

// Service function for SAAD to end voting early on an open election and start counting
export const closeElectionNow = async (params: {
  user: any;
  electionId: string;
}): Promise<ElectionDocument> => {
  await syncDueElections({ institution: params.user.institution, electionId: params.electionId });

  const now = new Date();
  const election = await Election.findOneAndUpdate(
    {
      _id: params.electionId,
      deletedAt: null,
      institution: params.user.institution,
      status: "OPEN",
    },
    { $set: { status: "CLOSED", endTime: now } },
    { returnDocument: "after" },
  );
  if (!election) throw new AppError("Only open elections can be closed", 400);

  await cancelElectionJobs(election._id.toString());
  await scheduleCountJob(election._id.toString());

  await recordAudit({
    action: "election.close",
    ...actorFields(params.user),
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { source: "manual", endTime: now.toISOString() },
  });

  return election;
};

// Service function for SAAD to push back the end time of an open election
export const extendElection = async (params: {
  user: any;
  electionId: string;
  endTime: unknown;
}): Promise<ElectionDocument> => {
  await syncDueElections({ institution: params.user.institution, electionId: params.electionId });

  const election = await findInstitutionElection(params.user, params.electionId);
  if (election.status !== "OPEN") {
    throw new AppError("Only open elections can be extended", 400);
  }

  const endTime = requireDate(params.endTime, "endTime");
  if (election.endTime && endTime <= election.endTime) {
    throw new AppError("New end time must be later than the current end time", 400);
  }

  const previousEndTime = election.endTime;
  election.endTime = endTime;
  await election.save();

  await rescheduleCloseJob(election._id.toString(), endTime);

  await recordAudit({
    action: "election.extend",
    ...actorFields(params.user),
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: {
      previousEndTime: previousEndTime?.toISOString(),
      endTime: endTime.toISOString(),
    },
  });

  return election;
};

// Service function to archive a closed election, hiding it from students
export const archiveElection = async (params: {
  user: any;
  electionId: string;
}): Promise<ElectionDocument> => {
  const election = await findInstitutionElection(params.user, params.electionId);

  if (election.status !== "RESULTS_PUBLISHED" && election.status !== "CLOSED") {
    throw new AppError("Only closed elections can be archived", 400);
  }

  election.archived = true;
  election.status = "ARCHIVED";
  await election.save();

  await recordAudit({
    action: "election.archive",
    ...actorFields(params.user),
    targetCollection: "Election",
    targetId: election._id?.toString(),
  });

  return election;
};

// Service function to publish the latest results snapshot of a closed, counted election to students
export const publishResults = async (params: {
  user: any;
  electionId: string;
}): Promise<ElectionDocument> => {
  const election = await findInstitutionElection(params.user, params.electionId);

  if (election.status !== "CLOSED") {
    throw new AppError("Results can only be published once the election is closed and counted", 400);
  }

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
    ...actorFields(params.user),
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: { snapshotId: snapshot._id?.toString() },
  });

  return election;
};

// Service function to soft delete a draft or scheduled election with its positions and candidates, cancelling its jobs
export const softDeleteElection = async (params: {
  user: any;
  electionId: string;
}): Promise<void> => {
  const election = await findInstitutionElection(params.user, params.electionId);

  if (!DELETABLE_STATUSES.includes(election.status)) {
    throw new AppError("Only draft or scheduled elections can be deleted. Archive it instead.", 400);
  }

  election.deletedAt = new Date();
  election.deletedBy = new Types.ObjectId(params.user._id);
  await election.save();

  await cancelElectionJobs(election._id.toString());

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
    ...actorFields(params.user),
    targetCollection: "Election",
    targetId: election._id?.toString(),
  });
};
