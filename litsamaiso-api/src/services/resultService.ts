import { createHmac } from "crypto";
import { Types } from "mongoose";
import { Election } from "../models/Election.js";
import { Position } from "../models/Position.js";
import { Candidate } from "../models/Candidate.js";
import { Ballot } from "../models/Ballot.js";
import { ResultSnapshot, type ResultSnapshotDocument } from "../models/ResultSnapshot.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";

const snapshotHash = (payload: string): string => {
  const secret = process.env.ELECTION_HMAC_SECRET;
  if (!secret) {
    throw new AppError("ELECTION_HMAC_SECRET is not configured", 500);
  }
  return createHmac("sha256", secret).update(payload).digest("hex");
};

export const computeElectionResults = async (
  electionId: string,
  options?: { source?: "job" | "manual"; actor?: any },
): Promise<ResultSnapshotDocument> => {
  const query: Record<string, any> = { _id: electionId, deletedAt: null };
  if (options?.actor?.institution) {
    query.institution = options.actor.institution;
  }
  const election = await Election.findOne(query);
  if (!election) throw new AppError("Election not found", 404);

  if (!["CLOSED", "COUNTING", "RESULTS_PUBLISHED"].includes(election.status)) {
    throw new AppError("Election must be closed before counting", 400);
  }

  const previousStatus = election.status;
  if (election.status === "COUNTING") {
    const existingSnapshot = await ResultSnapshot.findOne({ electionId: election._id })
      .sort({ generatedAt: -1 })
      .lean();
    if (existingSnapshot && options?.source === "job") {
      return existingSnapshot as ResultSnapshotDocument;
    }
  } else {
    election.status = "COUNTING";
    await election.save();
  }

  try {

  const positions = await Position.find({
    electionId: election._id,
    deletedAt: null,
    isActive: true,
  })
    .sort({ displayOrder: 1 })
    .lean();

  const candidates = await Candidate.find({
    electionId: election._id,
    deletedAt: null,
    approved: true,
    disqualified: false,
  }).lean();

  const countMap = new Map<string, number>();

  const counts = await Ballot.aggregate([
    { $match: { electionId: new Types.ObjectId(election._id), deletedAt: null } },
    { $unwind: "$selections" },
    {
      $group: {
        _id: {
          positionId: "$selections.positionId",
          candidateId: "$selections.candidateId",
        },
        votes: { $sum: 1 },
      },
    },
  ]);

  for (const row of counts) {
    const key = `${row._id.positionId.toString()}:${row._id.candidateId.toString()}`;
    countMap.set(key, row.votes);
  }

  const positionsSnapshot = positions.map((position) => {
    const positionCandidates = candidates.filter(
      (c) => c.positionId.toString() === position._id.toString(),
    );

    const rankings = positionCandidates
      .map((candidate) => {
        const key = `${position._id.toString()}:${candidate._id.toString()}`;
        const votes = countMap.get(key) || 0;
        return {
          candidateId: candidate._id,
          votes,
        };
      })
      .sort((a, b) => b.votes - a.votes);

    const totalVotes = rankings.reduce((sum, r) => sum + r.votes, 0);

    const enriched = rankings.map((rank, index) => ({
      candidateId: rank.candidateId,
      votes: rank.votes,
      percentage: totalVotes > 0 ? Number(((rank.votes / totalVotes) * 100).toFixed(2)) : 0,
      rank: index + 1,
    }));

    const winner = enriched[0]?.candidateId || null;

    return {
      positionId: position._id,
      rankings: enriched,
      winnerId: winner,
    };
  });

  const generatedAt = new Date();
  const payload = JSON.stringify({
    electionId: election._id.toString(),
    generatedAt: generatedAt.toISOString(),
    positions: positionsSnapshot.map((p) => ({
      positionId: p.positionId.toString(),
      winnerId: p.winnerId ? p.winnerId.toString() : null,
      rankings: p.rankings.map((r) => ({
        candidateId: r.candidateId.toString(),
        votes: r.votes,
        percentage: r.percentage,
        rank: r.rank,
      })),
    })),
  });

  const snapshot = await ResultSnapshot.create({
    electionId: election._id,
    generatedAt,
    positions: positionsSnapshot,
    snapshotHash: snapshotHash(payload),
    generatedBy: options?.actor?._id,
  });

  if (positionsSnapshot.length) {
    const bulk = positionsSnapshot.flatMap((position) =>
      position.rankings.map((rank) => ({
        updateOne: {
          filter: { _id: rank.candidateId },
          update: { $set: { voteCountCached: rank.votes } },
        },
      })),
    );
    if (bulk.length) {
      await Candidate.bulkWrite(bulk);
    }
  }

  election.status = election.resultsPublished ? "RESULTS_PUBLISHED" : "CLOSED";
  await election.save();

  await recordAudit({
    action: "results.count",
    actorId: options?.actor?._id?.toString(),
    actorEmail: options?.actor?.email,
    actorRole: (options?.actor?.role && (options?.actor?.role as any).name) || options?.actor?.role,
    targetCollection: "ResultSnapshot",
    targetId: snapshot._id?.toString(),
    details: { electionId: election._id?.toString(), source: options?.source || "manual" },
  });

  return snapshot;
  } catch (err) {
    election.status = previousStatus;
    await election.save();
    throw err;
  }
};

export const getLatestResults = async (params: {
  electionId: string;
}): Promise<ResultSnapshotDocument | null> => {
  return ResultSnapshot.findOne({ electionId: params.electionId }).sort({ generatedAt: -1 });
};

export const getResultsWinners = async (params: {
  electionId: string;
}): Promise<{
  generatedAt: Date;
  winners: Array<{
    positionId: string;
    positionTitle?: string;
    candidateId: string | null;
    candidateName?: string;
    votes?: number;
    percentage?: number;
    rank?: number;
  }>;
}> => {
  const snapshot = await ResultSnapshot.findOne({ electionId: params.electionId })
    .sort({ generatedAt: -1 })
    .lean();
  if (!snapshot) throw new AppError("No results found", 404);

  const positionIds = snapshot.positions.map((p) => p.positionId);
  const winnerIds = snapshot.positions
    .map((p) => p.winnerId)
    .filter(Boolean) as any[];

  const [positions, candidates] = await Promise.all([
    Position.find({ _id: { $in: positionIds } })
      .select("title")
      .lean(),
    Candidate.find({ _id: { $in: winnerIds } })
      .select("fullName")
      .lean(),
  ]);

  const positionMap = new Map(positions.map((p) => [p._id.toString(), p]));
  const candidateMap = new Map(candidates.map((c) => [c._id.toString(), c]));

  const winners = snapshot.positions.map((position) => {
    const positionId = position.positionId.toString();
    const winnerId = position.winnerId ? position.winnerId.toString() : null;
    const winnerRanking = winnerId
      ? position.rankings.find((r) => r.candidateId.toString() === winnerId)
      : undefined;

    const res: any = {
      positionId,
      candidateId: winnerId,
    };
    const title = positionMap.get(positionId)?.title;
    if (title) res.positionTitle = title;
    
    const cName = winnerId ? candidateMap.get(winnerId)?.fullName : undefined;
    if (cName) res.candidateName = cName;
    
    if (winnerRanking?.votes !== undefined) res.votes = winnerRanking.votes;
    if (winnerRanking?.percentage !== undefined) res.percentage = winnerRanking.percentage;
    if (winnerRanking?.rank !== undefined) res.rank = winnerRanking.rank;

    return res;
  });

  return { generatedAt: snapshot.generatedAt, winners };
};

export const getResultsByPosition = async (params: {
  electionId: string;
  positionId: string;
}): Promise<{
  generatedAt: Date;
  positionId: string;
  positionTitle?: string;
  rankings: Array<{
    candidateId: string;
    candidateName?: string;
    votes: number;
    percentage: number;
    rank: number;
  }>;
}> => {
  const snapshot = await ResultSnapshot.findOne({ electionId: params.electionId })
    .sort({ generatedAt: -1 })
    .lean();
  if (!snapshot) throw new AppError("No results found", 404);

  const positionSnapshot = snapshot.positions.find(
    (p) => p.positionId.toString() === params.positionId,
  );
  if (!positionSnapshot) throw new AppError("Position results not found", 404);

  const position = await Position.findById(params.positionId).select("title").lean();
  const candidateIds = positionSnapshot.rankings.map((r) => r.candidateId);
  const candidates = await Candidate.find({ _id: { $in: candidateIds } })
    .select("fullName")
    .lean();
  const candidateMap = new Map(candidates.map((c) => [c._id.toString(), c]));

  const rankings = positionSnapshot.rankings.map((rank) => {
    const res: any = {
      candidateId: rank.candidateId.toString(),
      votes: rank.votes,
      percentage: rank.percentage,
      rank: rank.rank,
    };
    const cName = candidateMap.get(rank.candidateId.toString())?.fullName;
    if (cName) res.candidateName = cName;
    return res;
  });

  const res: any = {
    generatedAt: snapshot.generatedAt,
    positionId: params.positionId,
    rankings,
  };
  if (position?.title) res.positionTitle = position.title;
  return res;
};
