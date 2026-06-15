import type { Request, Response } from "express";
import AppError from "../utils/errors.js";
import { uploadImageBuffer } from "../utils/cloudinary.js";
import {
  createCandidate,
  updateCandidate,
  softDeleteCandidate,
  listCandidatesByPosition,
  approveCandidate,
  disqualifyCandidate,
} from "../services/candidateService.js";

const handleError = (res: Response, err: any): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  res.status(500).json({ message: err.message || String(err) });
};
// Helper function to resolve image URL from uploaded file
const resolveImageUrl = async (req: Request): Promise<string | undefined> => {
  const file = (req as any).file as { buffer: Buffer; originalname?: string } | undefined;
  if (!file || !file.buffer) return undefined;

  const result = await uploadImageBuffer({
    buffer: file.buffer,
    ...(file.originalname !== undefined && { fileName: file.originalname }),
  });

  return result.url;
};
// Handler functions for candidate-related endpoints
export const createCandidateHandler = async (req: Request, res: Response) => {
  try {
    const imageUrl = await resolveImageUrl(req);
    const candidate = await createCandidate({
      user: (req as any).user,
      electionId: req.params.electionId as string,
      positionId: req.params.positionId as string,
      fullName: (req.body || {}).fullName,
      party: (req.body || {}).party,
      manifesto: (req.body || {}).manifesto,
      studentId: (req.body || {}).studentId,
      ...(imageUrl !== undefined && { imageUrl }),
    });

    res.status(201).json({ message: "Candidate created", candidate });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to update candidate details, including optional image upload
export const updateCandidateHandler = async (req: Request, res: Response) => {
  try {
    const imageUrl = await resolveImageUrl(req);
    const updates = { ...(req.body || {}) } as Record<string, unknown>;
    if (imageUrl) {
      updates.imageUrl = imageUrl;
    }

    const candidate = await updateCandidate({
      user: (req as any).user,
      candidateId: req.params.id as string,
      updates,
    });

    res.json({ message: "Candidate updated", candidate });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to soft delete a candidate
export const deleteCandidateHandler = async (req: Request, res: Response) => {
  try {
    await softDeleteCandidate({
      user: (req as any).user,
      candidateId: req.params.id as string,
    });

    res.json({ message: "Candidate deleted" });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to list candidates for a specific position
export const listCandidatesByPositionHandler = async (req: Request, res: Response) => {
  try {
    const candidates = await listCandidatesByPosition({
      user: (req as any).user,
      positionId: req.params.positionId as string,
    });

    res.json({ candidates });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to approve a candidate
export const approveCandidateHandler = async (req: Request, res: Response) => {
  try {
    const candidate = await approveCandidate({
      user: (req as any).user,
      candidateId: req.params.id as string,
    });

    res.json({ message: "Candidate approved", candidate });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to disqualify a candidate
export const disqualifyCandidateHandler = async (req: Request, res: Response) => {
  try {
    const candidate = await disqualifyCandidate({
      user: (req as any).user,
      candidateId: req.params.id as string,
    });

    res.json({ message: "Candidate disqualified", candidate });
  } catch (err: any) {
    handleError(res, err);
  }
};
