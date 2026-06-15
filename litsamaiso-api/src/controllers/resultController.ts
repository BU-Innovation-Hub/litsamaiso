import type { Request, Response } from "express";
import AppError from "../utils/errors.js";
import {
  computeElectionResults,
  getLatestResults,
  getResultsWinners,
  getResultsByPosition,
} from "../services/resultService.js";
import { Election } from "../models/Election.js";

const handleError = (res: Response, err: any): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  res.status(500).json({ message: err.message || String(err) });
};
// Handler function to manually trigger results computation for an election
export const recomputeResultsHandler = async (req: Request, res: Response) => {
  try {
    const snapshot = await computeElectionResults(req.params.electionId as string, {
      source: "manual",
      actor: (req as any).user,
    });

    res.json({ message: "Results computed", snapshot });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to get the latest results snapshot for an election, with access control based on role and publication status
export const getResultsHandler = async (req: Request, res: Response) => {
  try {
    const election = await Election.findOne({
      _id: req.params.electionId,
      deletedAt: null,
      institution: (req as any).user.institution,
    }).lean();

    if (!election) {
      res.status(404).json({ message: "Election not found" });
      return;
    }

    const role = String(
      ((req as any).user?.role && ((req as any).user.role as any).name) ||
        (req as any).user?.role ||
        "",
    ).toLowerCase();

    if (role === "student" && !election.resultsPublished) {
      res.status(403).json({ message: "Results not published" });
      return;
    }

    const snapshot = await getLatestResults({ electionId: req.params.electionId as string });
    if (!snapshot) {
      res.status(404).json({ message: "No results found" });
      return;
    }

    res.json({ snapshot });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to get the winners for each position in an election, with access control based on role and publication status
export const getResultsWinnersHandler = async (req: Request, res: Response) => {
  try {
    const election = await Election.findOne({
      _id: req.params.electionId,
      deletedAt: null,
      institution: (req as any).user.institution,
    }).lean();

    if (!election) {
      res.status(404).json({ message: "Election not found" });
      return;
    }

    const role = String(
      ((req as any).user?.role && ((req as any).user.role as any).name) ||
        (req as any).user?.role ||
        "",
    ).toLowerCase();

    if (role === "student" && !election.resultsPublished) {
      res.status(403).json({ message: "Results not published" });
      return;
    }

    const winners = await getResultsWinners({ electionId: req.params.electionId as string });
    res.json({ winners });
  } catch (err: any) {
    handleError(res, err);
  }
};
// Handler function to get detailed results for a specific position in an election, with access control based on role and publication status
export const getResultsByPositionHandler = async (req: Request, res: Response) => {
  try {
    const election = await Election.findOne({
      _id: req.params.electionId,
      deletedAt: null,
      institution: (req as any).user.institution,
    }).lean();

    if (!election) {
      res.status(404).json({ message: "Election not found" });
      return;
    }

    const role = String(
      ((req as any).user?.role && ((req as any).user.role as any).name) ||
        (req as any).user?.role ||
        "",
    ).toLowerCase();

    if (role === "student" && !election.resultsPublished) {
      res.status(403).json({ message: "Results not published" });
      return;
    }

    const position = await getResultsByPosition({
      electionId: req.params.electionId as string,
      positionId: req.params.positionId as string,
    });

    res.json({ position });
  } catch (err: any) {
    handleError(res, err);
  }
};
