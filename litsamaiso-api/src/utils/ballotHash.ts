import { createHmac } from "crypto";
import AppError from "./errors.js";

export type BallotSelection = {
  positionId: string;
  candidateId: string;
};

const canonicalizeSelections = (selections: BallotSelection[]): BallotSelection[] => {
  return [...selections]
    .map((s) => ({
      positionId: String(s.positionId),
      candidateId: String(s.candidateId),
    }))
    .sort((a, b) =>
      a.positionId === b.positionId
        ? a.candidateId.localeCompare(b.candidateId)
        : a.positionId.localeCompare(b.positionId),
    );
};

export const buildBallotHash = (params: {
  electionId: string;
  studentId: string;
  receiptId: string;
  submittedAt: Date;
  selections: BallotSelection[];
}): { payload: string; hash: string } => {
  const secret = process.env.ELECTION_HMAC_SECRET;
  if (!secret) {
    throw new AppError("ELECTION_HMAC_SECRET is not configured", 500);
  }

  const canonical = {
    electionId: String(params.electionId),
    studentId: String(params.studentId),
    receiptId: String(params.receiptId),
    submittedAt: params.submittedAt.toISOString(),
    selections: canonicalizeSelections(params.selections),
  };

  const payload = JSON.stringify(canonical);
  const hash = createHmac("sha256", secret).update(payload).digest("hex");

  return { payload, hash };
};
