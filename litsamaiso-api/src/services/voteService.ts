import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { Election } from "../models/Election.js";
import { Position } from "../models/Position.js";
import { Candidate } from "../models/Candidate.js";
import { Ballot } from "../models/Ballot.js";
import { VoterRecord } from "../models/VoterRecord.js";
import { Student } from "../models/Student.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { buildBallotHash, type BallotSelection } from "../utils/ballotHash.js";
import { syncDueElections } from "./electionService.js";
import { withOptionalTransaction } from "../utils/transaction.js";

type VoteReceipt = { receiptId: string; submittedAt: Date };

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

const toReceipt = (record: { receiptId: string; submittedAt: Date }): VoteReceipt => ({
  receiptId: record.receiptId,
  submittedAt: record.submittedAt,
});

export const castVote = async (params: {
  user: any;
  electionId: string;
  selections: BallotSelection[];
  ipAddress?: string;
  userAgent?: string;
  idempotencyKey?: string;
}): Promise<VoteReceipt> => {
  await syncDueElections({ institution: params.user.institution, electionId: params.electionId });

  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  if (election.status !== "OPEN") {
    throw new AppError("Election is not open", 400);
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

  const [positions, candidates] = await Promise.all([
    Position.find({ electionId: election._id, deletedAt: null, isActive: true })
      .sort({ displayOrder: 1 })
      .lean(),
    Candidate.find({
      electionId: election._id,
      deletedAt: null,
      approved: true,
      disqualified: false,
    })
      .select("_id positionId")
      .lean(),
  ]);

  // Only positions with at least one approved candidate appear on the ballot
  const candidatePositionMap = new Map(
    candidates.map((candidate) => [candidate._id.toString(), candidate.positionId.toString()]),
  );
  const ballotPositions = positions.filter((position) =>
    candidates.some((candidate) => candidate.positionId.toString() === position._id.toString()),
  );
  if (!ballotPositions.length) {
    throw new AppError("Election has no positions with candidates", 400);
  }

  const normalizedSelections = normalizeSelections(params.selections);
  const ballotPositionIds = new Set(ballotPositions.map((p) => p._id.toString()));
  const selectedPositions = new Set<string>();

  for (const selection of normalizedSelections) {
    if (!selection.positionId || !selection.candidateId) {
      throw new AppError("Selections must include positionId and candidateId", 400);
    }
    if (!ballotPositionIds.has(selection.positionId)) {
      throw new AppError("Invalid position in selections", 400);
    }
    if (selectedPositions.has(selection.positionId)) {
      throw new AppError("Only one candidate can be selected per position", 400);
    }
    if (candidatePositionMap.get(selection.candidateId) !== selection.positionId) {
      throw new AppError("Invalid candidate selection", 400);
    }
    selectedPositions.add(selection.positionId);
  }

  const missing = ballotPositions.filter((p) => !selectedPositions.has(p._id.toString()));
  if (missing.length > 0) {
    throw new AppError(
      `Select a candidate for every position. Missing: ${missing.map((p) => p.title).join(", ")}`,
      400,
    );
  }

  let receipt: VoteReceipt | null = null;

  try {
    receipt = await withOptionalTransaction(async (session) => {
      const existing = await VoterRecord.findOne({ electionId: election._id, studentId })
        .session(session)
        .lean();
      if (existing) {
        if (params.idempotencyKey && existing.idempotencyKey === params.idempotencyKey) {
          return toReceipt(existing);
        }
        throw new AppError("You have already voted", 409);
      }

      const receiptId = randomUUID();
      const submittedAt = new Date();
      const ballotId = randomUUID();
      const { hash } = buildBallotHash({
        electionId: election._id.toString(),
        ballotId,
        selections: normalizedSelections,
      });

      // The voter record goes first: its unique (election, student) index is what stops a double vote
      const [voterRecord] = await VoterRecord.create(
        [
          {
            electionId: election._id,
            studentId,
            receiptId,
            submittedAt,
            ...(params.idempotencyKey !== undefined && { idempotencyKey: params.idempotencyKey }),
            ...(params.ipAddress !== undefined && { ipAddress: params.ipAddress }),
            ...(params.userAgent !== undefined && { userAgent: params.userAgent }),
          },
        ],
        { session },
      );

      try {
        await Ballot.create(
          [
            {
              _id: ballotId,
              electionId: election._id,
              selections: normalizedSelections.map((s) => ({
                positionId: new mongoose.Types.ObjectId(s.positionId),
                candidateId: new mongoose.Types.ObjectId(s.candidateId),
              })),
              ballotHash: hash,
            },
          ],
          { session },
        );
      } catch (err) {
        // Without a transaction, undo the voter record so the student isn't marked as voted with no ballot
        if (!session) await VoterRecord.deleteOne({ _id: voterRecord!._id });
        throw err;
      }

      return { receiptId, submittedAt };
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const existing = await VoterRecord.findOne({ electionId: election._id, studentId }).lean();
      if (existing && params.idempotencyKey && existing.idempotencyKey === params.idempotencyKey) {
        receipt = toReceipt(existing);
      } else if (existing) {
        throw new AppError("You have already voted", 409);
      }
    }

    if (!receipt) throw err;
  }

  await recordAudit({
    action: "vote.cast",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "VoterRecord",
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

  const record = await VoterRecord.findOne({ electionId: election._id, studentId })
    .select("receiptId submittedAt")
    .lean();

  if (!record) {
    return { hasVoted: false };
  }

  return { hasVoted: true, receiptId: record.receiptId, submittedAt: record.submittedAt };
};

export const getVoteReceipt = async (params: {
  user: any;
  receiptId: string;
}): Promise<{ receiptId: string; submittedAt: Date; electionId: string }> => {
  const record = await VoterRecord.findOne({ receiptId: params.receiptId }).lean();
  if (!record) throw new AppError("Receipt not found", 404);

  const election = await Election.findOne({
    _id: record.electionId,
    deletedAt: null,
    institution: params.user.institution,
  }).lean();
  if (!election) throw new AppError("Election not found", 404);

  const roleName = resolveRoleName(params.user);
  if (roleName === "student") {
    const studentId = params.user.studentId;
    if (!studentId || String(record.studentId) !== String(studentId)) {
      throw new AppError("Receipt not found", 404);
    }
  }

  return {
    receiptId: record.receiptId,
    submittedAt: record.submittedAt,
    electionId: String(record.electionId),
  };
};
