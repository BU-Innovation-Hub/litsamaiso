import type { Request, Response } from "express";
import { getAccountReport, getAccountReports } from "../services/accountReportService.js";

const getOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const listAccountReports = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const institutionId = typeof req.query.institutionId === "string" ? req.query.institutionId : undefined;
    const stuckDays = getOptionalNumber(req.query.stuckDays);
    const recentDays = getOptionalNumber(req.query.recentDays);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const batchNumber = typeof req.query.batchNumber === "string" ? req.query.batchNumber : undefined;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

    const reportArgs: {
      user: any;
      institutionId?: string;
      stuckDays?: number;
      recentDays?: number;
      search?: string;
      status?: string;
      batchNumber?: string;
      startDate?: string;
      endDate?: string;
    } = { user };
    if (institutionId !== undefined) reportArgs.institutionId = institutionId;
    if (stuckDays !== undefined) reportArgs.stuckDays = stuckDays;
    if (recentDays !== undefined) reportArgs.recentDays = recentDays;
    if (search !== undefined) reportArgs.search = search;
    if (status !== undefined) reportArgs.status = status;
    if (batchNumber !== undefined) reportArgs.batchNumber = batchNumber;
    if (startDate !== undefined) reportArgs.startDate = startDate;
    if (endDate !== undefined) reportArgs.endDate = endDate;

    const result = await getAccountReports(reportArgs);

    res.json({
      message: "Account reports generated",
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || String(err) });
  }
};

export const getSingleAccountReport = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const reportKey = Array.isArray(req.params.reportKey)
      ? req.params.reportKey[0]
      : req.params.reportKey;
    const institutionId = typeof req.query.institutionId === "string" ? req.query.institutionId : undefined;
    const stuckDays = getOptionalNumber(req.query.stuckDays);
    const recentDays = getOptionalNumber(req.query.recentDays);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const batchNumber = typeof req.query.batchNumber === "string" ? req.query.batchNumber : undefined;
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;

    if (!reportKey) {
      res.status(400).json({ message: "reportKey is required" });
      return;
    }

    const reportArgs: {
      user: any;
      key: string;
      institutionId?: string;
      stuckDays?: number;
      recentDays?: number;
      search?: string;
      status?: string;
      batchNumber?: string;
      startDate?: string;
      endDate?: string;
    } = { user, key: reportKey };
    if (institutionId !== undefined) reportArgs.institutionId = institutionId;
    if (stuckDays !== undefined) reportArgs.stuckDays = stuckDays;
    if (recentDays !== undefined) reportArgs.recentDays = recentDays;
    if (search !== undefined) reportArgs.search = search;
    if (status !== undefined) reportArgs.status = status;
    if (batchNumber !== undefined) reportArgs.batchNumber = batchNumber;
    if (startDate !== undefined) reportArgs.startDate = startDate;
    if (endDate !== undefined) reportArgs.endDate = endDate;

    const result = await getAccountReport(reportArgs);

    res.json({
      message: "Account report generated",
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || String(err) });
  }
};
