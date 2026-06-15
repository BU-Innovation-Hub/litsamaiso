import type { Request, Response } from "express";
import {
  createElection,
  updateElection,
  scheduleElection,
  publishElection,
  archiveElection,
  publishResults,
  softDeleteElection,
} from "../services/electionService.js";
import { Election } from "../models/Election.js";
import AppError from "../utils/errors.js";

const handleError = (res: Response, err: any): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  res.status(500).json({ message: err.message || String(err) });
};
// Handler function to create a new election
export const createElectionHandler = async (req: Request, res: Response) => {
  try {
    const election = await createElection({
      user: (req as any).user,
      title: (req.body || {}).title,
      description: (req.body || {}).description,
      academicYear: (req.body || {}).academicYear,
      timezone: (req.body || {}).timezone,
      votingRules: (req.body || {}).votingRules,
      securitySettings: (req.body || {}).securitySettings,
    });

    res.status(201).json({ message: "Election created", election });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to update election details, including optional image upload
export const updateElectionHandler = async (req: Request, res: Response) => {
  try {
    const election = await updateElection({
      user: (req as any).user,
      electionId: req.params.id as string,
      updates: req.body || {},
    });

    res.json({ message: "Election updated", election });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to soft delete an election
export const scheduleElectionHandler = async (req: Request, res: Response) => {
  try {
    const election = await scheduleElection({
      user: (req as any).user,
      electionId: req.params.id as string,
      startTime: (req.body || {}).startTime,
      endTime: (req.body || {}).endTime,
      timezone: (req.body || {}).timezone,
    });

    res.json({ message: "Election scheduled", election });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to publish an election and make it available for voting
export const publishElectionHandler = async (req: Request, res: Response) => {
  try {
    const election = await publishElection({
      user: (req as any).user,
      electionId: req.params.id as string,
      startTime: (req.body || {}).startTime,
      endTime: (req.body || {}).endTime,
      timezone: (req.body || {}).timezone,
    });

    res.json({ message: "Election published", election });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to archive an election, making it read-only and hidden from voters
export const archiveElectionHandler = async (req: Request, res: Response) => {
  try {
    const election = await archiveElection({
      user: (req as any).user,
      electionId: req.params.id as string,
    });

    res.json({ message: "Election archived", election });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to publish election results, making them visible to voters
export const publishResultsHandler = async (req: Request, res: Response) => {
  try {
    const election = await publishResults({
      user: (req as any).user,
      electionId: req.params.id as string,
    });

    res.json({ message: "Results published", election });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to soft delete an election
export const deleteElectionHandler = async (req: Request, res: Response) => {
  try {
    await softDeleteElection({
      user: (req as any).user,
      electionId: req.params.id as string,
    });

    res.json({ message: "Election deleted" });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to list elections for the user's institution, with different visibility based on role
export const listElectionsHandler = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isStudent = String(
      (user?.role && (user.role as any).name) || user?.role || "",
    ).toLowerCase() === "student";

    const filter: Record<string, unknown> = {
      institution: user.institution,
      deletedAt: null,
    };

    if (isStudent) {
      filter.published = true;
      filter.archived = false;
    }

    const elections = await Election.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ elections });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to get details of a specific election by ID, with access control based on role
export const getElectionHandler = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isStudent = String(
      (user?.role && (user.role as any).name) || user?.role || "",
    ).toLowerCase() === "student";

    const query: Record<string, unknown> = {
      _id: req.params.id,
      institution: user.institution,
      deletedAt: null,
    };

    if (isStudent) {
      query.published = true;
      query.archived = false;
    }

    const election = await Election.findOne(query).lean();

    if (!election) {
      res.status(404).json({ message: "Election not found" });
      return;
    }

    res.json({ election });
  } catch (err: any) {
    handleError(res, err);
  }
};
