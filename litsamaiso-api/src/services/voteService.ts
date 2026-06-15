import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { Election } from "../models/Election.js";
import { Position } from "../models/Position.js";
import { Candidate } from "../models/Candidate.js";
import { Ballot } from "../models/Ballot.js";
import { Student } from "../models/Student.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { buildBallotHash, type BallotSelection } from "../utils/ballotHash.js";

const resolveRoleName = (user: any): string => {
  const resolved =
    (user?.role && (user.role as any).name) || (user?.role as string) || "";
  return String(resolved).toLowerCase();
};

const ensureStudentEligibility = async (params: {
  studentId: string;
  institutionId: any;
}): Promise<void> => {
  const student = await Student.findOne({
    studentId: params.studentId,
    institution: params.institutionId,
    studentStatus: true,
  }).lean();
  if (!student) {
    throw new AppError("Student is not eligible to vote", 403);
  }
};

const normalizeSelections = (selections: BallotSelection[]): BallotSelection[] => {
  return selections.map((selection) => ({
    positionId: String(selection.positionId),
    candidateId: String(selection.candidateId),
  }));
};

const isDuplicateKeyError = (err: any): boolean => {
  return Boolean(err && typeof err === "object" && (err as any).code === 11000);
};

export const castVote = async (params: {
  user: any;
  electionId: string;
  selections: BallotSelection[];
  ipAddress?: string;
  userAgent?: string;
  idempotencyKey?: string;
}): Promise<{ receiptId: string; ballotHash: string; submittedAt: Date }> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  if (election.status !== "OPEN") {
    throw new AppError("Election is not open", 400);
  }

  const now = new Date();
  if (election.startTime && now < election.startTime) {
    throw new AppError("Election has not started", 400);
  }
  if (election.endTime && now >= election.endTime) {
    throw new AppError("Election has ended", 400);
  }

  const studentId = params.user.studentId;
  if (!studentId) {
    throw new AppError("Student account is required to vote", 400);
  }

  await ensureStudentEligibility({
    studentId,
    institutionId: params.user.institution,
  });

  if (!Array.isArray(params.selections) || params.selections.length === 0) {
    throw new AppError("Selections are required", 400);
  }

  const positions = await Position.find({
    electionId: election._id,
    deletedAt: null,
    isActive: true,
  })
    .sort({ displayOrder: 1 })
    .lean();

  if (!positions.length) {
    throw new AppError("Election has no active positions", 400);
  }

  const normalizedSelections = normalizeSelections(params.selections);
  const positionIds = new Set(positions.map((p) => p._id.toString()));
  const selectionCounts = new Map<string, Set<string>>();
  const candidateIds = new Set<string>();

  for (const selection of normalizedSelections) {
    if (!selection.positionId || !selection.candidateId) {
      throw new AppError("Selections must include positionId and candidateId", 400);
    }

    if (!positionIds.has(selection.positionId)) {
      throw new AppError("Invalid position in selections", 400);
    }
    
    if (!selectionCounts.has(selection.positionId)) {
      selectionCounts.set(selection.positionId, new Set());
    }
    const candSet = selectionCounts.get(selection.positionId)!;
    
    if (candSet.has(selection.candidateId)) {
      throw new AppError("Duplicate candidate selection for the same position", 400);
    }
    
    candSet.add(selection.candidateId);
    candidateIds.add(selection.candidateId);
  }

  for (const pos of positions) {
    const posId = pos._id.toString();
    const count = selectionCounts.get(posId)?.size || 0;
    const allowAbstain = (election.votingRules as any)?.allowAbstain ?? false;
    
    if (count === 0 && !allowAbstain) {
      throw new AppError(`You must select at least one candidate for position: ${pos.title || posId}`, 400);
    }
    
    const maxAllowed = (pos as any).maxVotesAllowed || 1;
    if (count > maxAllowed) {
      throw new AppError(`You cannot select more than ${maxAllowed} candidates for position: ${pos.title || posId}`, 400);
    }
  }

  const candidates = await Candidate.find({
    _id: { $in: Array.from(candidateIds) },
    electionId: election._id,
    deletedAt: null,
    approved: true,
    disqualified: false,
  })
    .select("_id positionId")
    .lean();

  if (candidates.length !== normalizedSelections.length) {
    throw new AppError("Invalid candidate selection", 400);
  }

  const candidatePositionMap = new Map(
    candidates.map((candidate) => [
      candidate._id.toString(),
      candidate.positionId.toString(),
    ]),
  );

  for (const selection of normalizedSelections) {
    const mappedPositionId = candidatePositionMap.get(selection.candidateId);
    if (!mappedPositionId || mappedPositionId !== selection.positionId) {
      throw new AppError("Invalid candidate selection", 400);
    }
  }

  const session = await mongoose.startSession();
  let receipt: { receiptId: string; ballotHash: string; submittedAt: Date } | null = null;

  try {
    await session.withTransaction(async () => {
      if (params.idempotencyKey) {
        const existingByKey = await Ballot.findOne({
          electionId: election._id,
          studentId,
          idempotencyKey: params.idempotencyKey,
          deletedAt: null,
        })
          .session(session)
          .lean();

        if (existingByKey) {
          receipt = {
            receiptId: existingByKey.receiptId,
            ballotHash: existingByKey.ballotHash,
            submittedAt: existingByKey.submittedAt,
          };
          return;
        }
      }

      const existing = await Ballot.findOne({
        electionId: election._id,
        studentId,
        deletedAt: null,
      })
        .session(session)
        .lean();
      if (existing) {
        throw new AppError("You have already voted", 409);
      }

      const receiptId = randomUUID();
      const submittedAt = new Date();
      const { hash } = buildBallotHash({
        electionId: election._id.toString(),
        studentId,
        receiptId,
        submittedAt,
        selections: normalizedSelections,
      });

      await Ballot.create(
        [
          {
            electionId: election._id,
            studentId,
            submittedAt,
            selections: normalizedSelections.map((s) => ({
              positionId: new mongoose.Types.ObjectId(s.positionId),
              candidateId: new mongoose.Types.ObjectId(s.candidateId),
            })),
            ...(params.ipAddress !== undefined && { ipAddress: params.ipAddress }),
            ...(params.userAgent !== undefined && { userAgent: params.userAgent }),
            ballotHash: hash,
            receiptId,
            ...(params.idempotencyKey !== undefined && { idempotencyKey: params.idempotencyKey }),
          },
        ],
        { session },
      );

      receipt = { receiptId, ballotHash: hash, submittedAt };
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existing = await Ballot.findOne({
        electionId: election._id,
        studentId,
        deletedAt: null,
      }).lean();
      if (existing) {
        receipt = {
          receiptId: existing.receiptId,
          ballotHash: existing.ballotHash,
          submittedAt: existing.submittedAt,
        };
      }
    }

    if (!receipt) {
      if (err instanceof AppError) throw err;
      throw err;
    }
  } finally {
    session.endSession();
  }

  await recordAudit({
    action: "vote.cast",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Ballot",
    details: {
      electionId: election._id?.toString(),
      studentId,
      receiptId: receipt!.receiptId,
    },
  });

  return receipt!;
};

export const getVoteStatus = async (params: {
  user: any;
  electionId: string;
}): Promise<{ hasVoted: boolean; receiptId?: string; submittedAt?: Date }> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  }).lean();
  if (!election) throw new AppError("Election not found", 404);

  const studentId = params.user.studentId;
  if (!studentId) {
    throw new AppError("Student account is required", 400);
  }

  const ballot = await Ballot.findOne({
    electionId: election._id,
    studentId,
    deletedAt: null,
  })
    .select("receiptId submittedAt")
    .lean();

  if (!ballot) {
    return { hasVoted: false };
  }

  return { hasVoted: true, receiptId: ballot.receiptId, submittedAt: ballot.submittedAt };
};

export const getVoteReceipt = async (params: {
  user: any;
  receiptId: string;
}): Promise<{
  receiptId: string;
  ballotHash: string;
  submittedAt: Date;
  electionId: string;
}> => {
  const ballot = await Ballot.findOne({
    receiptId: params.receiptId,
    deletedAt: null,
  }).lean();
  if (!ballot) throw new AppError("Receipt not found", 404);

  const election = await Election.findOne({
    _id: ballot.electionId,
    deletedAt: null,
    institution: params.user.institution,
  }).lean();
  if (!election) throw new AppError("Election not found", 404);

  const roleName = resolveRoleName(params.user);
  if (roleName === "student") {
    const studentId = params.user.studentId;
    if (!studentId || String(ballot.studentId) !== String(studentId)) {
      throw new AppError("Receipt not found", 404);
    }
  }

  return {
    receiptId: ballot.receiptId,
    ballotHash: ballot.ballotHash,
    submittedAt: ballot.submittedAt,
    electionId: String(ballot.electionId),
  };
};
