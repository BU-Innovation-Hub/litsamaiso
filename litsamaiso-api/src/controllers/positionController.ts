import type { Request, Response } from "express";
import AppError from "../utils/errors.js";
import {
  createPosition,
  updatePosition,
  softDeletePosition,
  getPositionById,
  listPositionsByElection,
} from "../services/positionService.js";

const handleError = (res: Response, err: any): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  res.status(500).json({ message: err.message || String(err) });
};
// Handler function to create a new position within an election
export const createPositionHandler = async (req: Request, res: Response) => {
  try {
    const position = await createPosition({
      user: (req as any).user,
      electionId: req.params.electionId as string,
      title: (req.body || {}).title,
      description: (req.body || {}).description,
      maxVotesAllowed: (req.body || {}).maxVotesAllowed,
      displayOrder: (req.body || {}).displayOrder,
    });

    res.status(201).json({ message: "Position created", position });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to update position details, including optional image upload
export const updatePositionHandler = async (req: Request, res: Response) => {
  try {
    const position = await updatePosition({
      user: (req as any).user,
      positionId: req.params.id as string,
      updates: req.body || {},
    });

    res.json({ message: "Position updated", position });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to soft delete a position
export const deletePositionHandler = async (req: Request, res: Response) => {
  try {
    await softDeletePosition({
      user: (req as any).user,
      positionId: req.params.id as string,
    });

    res.json({ message: "Position deleted" });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to get details of a specific position by ID, with access control based on role
export const getPositionHandler = async (req: Request, res: Response) => {
  try {
    const position = await getPositionById({
      user: (req as any).user,
      positionId: req.params.id as string,
    });

    res.json({ position });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to list positions for a specific election, with access control based on role
export const listPositionsByElectionHandler = async (req: Request, res: Response) => {
  try {
    const positions = await listPositionsByElection({
      user: (req as any).user,
      electionId: req.params.electionId as string,
    });

    res.json({ positions });
  } catch (err: any) {
    handleError(res, err);
  }
};
