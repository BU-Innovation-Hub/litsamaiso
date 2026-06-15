import type { Request, Response } from "express";
import AppError from "../utils/errors.js";
import { castVote, getVoteReceipt, getVoteStatus } from "../services/voteService.js";

const handleError = (res: Response, err: any): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  res.status(500).json({ message: err.message || String(err) });
};
// Handler function to cast a vote for an election, with support for idempotency and capturing client metadata
export const castVoteHandler = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const selections = Array.isArray(body.selections) ? body.selections : [];
    const idempotencyKey = req.headers["idempotency-key"]
      ? String(req.headers["idempotency-key"])
      : undefined;

    const receipt = await castVote({
      user: (req as any).user,
      electionId: req.params.electionId as string,
      selections,
      ...(req.ip !== undefined && { ipAddress: req.ip }),
      ...(req.headers["user-agent"] !== undefined && { userAgent: req.headers["user-agent"] as string }),
      ...(idempotencyKey !== undefined && { idempotencyKey }),
    });

    res.status(201).json({
      message: "Vote cast",
      receipt,
    });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to get the voting status of the current user for a specific election
export const submitVoteHandler = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const selections = Array.isArray(body.selections) ? body.selections : [];
    const electionId = body.electionId ? String(body.electionId) : "";
    if (!electionId) {
      res.status(400).json({ message: "electionId is required" });
      return;
    }

    const idempotencyKey = req.headers["idempotency-key"]
      ? String(req.headers["idempotency-key"])
      : undefined;

    const receipt = await castVote({
      user: (req as any).user,
      electionId,
      selections,
      ...(req.ip !== undefined && { ipAddress: req.ip }),
      ...(req.headers["user-agent"] !== undefined && { userAgent: req.headers["user-agent"] as string }),
      ...(idempotencyKey !== undefined && { idempotencyKey }),
    });

    res.status(201).json({ message: "Vote cast", receipt });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to get the voting status of the current user for a specific election
export const getVoteStatusHandler = async (req: Request, res: Response) => {
  try {
    const electionId = req.query.electionId ? String(req.query.electionId) : "";
    if (!electionId) {
      res.status(400).json({ message: "electionId is required" });
      return;
    }

    const status = await getVoteStatus({
      user: (req as any).user,
      electionId,
    });

    res.json({ status });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to get the vote receipt by ID, with access control to ensure users can only access their own receipts
export const getVoteReceiptHandler = async (req: Request, res: Response) => {
  try {
    const receipt = await getVoteReceipt({
      user: (req as any).user,
      receiptId: req.params.id as string,
    });

    res.json({ receipt });
  } catch (err: any) {
    handleError(res, err);
  }
};
