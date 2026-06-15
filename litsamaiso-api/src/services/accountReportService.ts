import { Types } from "mongoose";
import { Account } from "../models/Account.js";
import { Institution } from "../models/Institution.js";

export type AccountReportKey =
  | "summary"
  | "status-breakdown"
  | "confirmation-overview"
  | "payment-overview"
  | "confirmed-not-paid"
  | "by-batch"
  | "by-bank"
  | "by-course"
  | "by-graduating"
  | "by-institution"
  | "imports-by-day"
  | "confirmations-by-day"
  | "payments-by-day"
  | "average-import-to-confirm"
  | "average-confirm-to-pay"
  | "stuck-confirmed"
  | "recent-payments"
  | "anomalies";

export interface ReportCatalogItem {
  key: AccountReportKey;
  title: string;
  description: string;
}

export interface ReportScope {
  institutionId?: string;
  institutionName?: string;
  allInstitutions: boolean;
}

export interface AccountReportContext {
  scope: ReportScope;
  reports: Record<string, unknown>;
  catalog: ReportCatalogItem[];
}

interface ScopedAccountRow {
  _id: Types.ObjectId;
  contractNumber: string;
  accountNumber: string;
  bankName: string;
  batchNumber: number;
  courseOfStudy: string;
  fullnames: string;
  graduating: boolean;
  status: string;
  paidDate?: Date | null;
  paidAt?: Date | null;
  institution: Types.ObjectId;
  confirmedBy?: Types.ObjectId | null;
  confirmationDate?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

interface ResolvedScope {
  filter: Record<string, unknown>;
  scope: ReportScope;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_STUCK_DAYS = 14;
const DEFAULT_RECENT_DAYS = 30;
const DEFAULT_SAMPLE_LIMIT = 20;

export const REPORT_CATALOG: ReportCatalogItem[] = [
  {
    key: "summary",
    title: "Summary",
    description: "High level totals for all accounts in scope.",
  },
  {
    key: "status-breakdown",
    title: "Status Breakdown",
    description: "Counts grouped by account status.",
  },
  {
    key: "confirmation-overview",
    title: "Confirmation Overview",
    description: "Confirmed versus unconfirmed accounts and rate.",
  },
  {
    key: "payment-overview",
    title: "Payment Overview",
    description: "Paid versus unpaid accounts and rate.",
  },
  {
    key: "confirmed-not-paid",
    title: "Confirmed Not Paid",
    description: "Accounts confirmed by students but not yet marked paid.",
  },
  {
    key: "by-batch",
    title: "By Batch",
    description: "Counts per upload batch number.",
  },
  {
    key: "by-bank",
    title: "By Bank",
    description: "Counts per bank name.",
  },
  {
    key: "by-course",
    title: "By Course",
    description: "Counts per course of study.",
  },
  {
    key: "by-graduating",
    title: "By Graduating Flag",
    description: "Counts split by graduating true or false.",
  },
  {
    key: "by-institution",
    title: "By Institution",
    description: "Counts grouped by institution.",
  },
  {
    key: "imports-by-day",
    title: "Imports By Day",
    description: "Accounts imported each day.",
  },
  {
    key: "confirmations-by-day",
    title: "Confirmations By Day",
    description: "Accounts confirmed each day.",
  },
  {
    key: "payments-by-day",
    title: "Payments By Day",
    description: "Accounts marked paid each day.",
  },
  {
    key: "average-import-to-confirm",
    title: "Average Import To Confirm",
    description: "Average days between import and confirmation.",
  },
  {
    key: "average-confirm-to-pay",
    title: "Average Confirm To Pay",
    description: "Average days between confirmation and payment.",
  },
  {
    key: "stuck-confirmed",
    title: "Stuck Confirmed",
    description: "Confirmed accounts older than the configured threshold that are still unpaid.",
  },
  {
    key: "recent-payments",
    title: "Recent Payments",
    description: "Recent payment activity and latest paid accounts.",
  },
  {
    key: "anomalies",
    title: "Anomalies",
    description: "Suspicious account states that need review.",
  },
];

const REPORT_KEYS = new Set(REPORT_CATALOG.map((item) => item.key));

const safeString = (value: unknown): string =>
  String(value ?? "").trim();

const normalizeKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toDateKey = (value: Date): string => {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseNumber = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const dateDiffDays = (start: Date, end: Date): number =>
  (end.getTime() - start.getTime()) / MS_PER_DAY;

const resolveScope = async (params: {
  user: any;
  institutionId?: string | undefined;
}): Promise<ResolvedScope> => {
  const userRole = safeString(params.user?.role?.name || params.user?.role);
  const isAppAdmin = userRole.toLowerCase() === "appadmin";

  if (isAppAdmin && params.institutionId) {
    const institutionObjectId = new Types.ObjectId(params.institutionId);
    const institution = await Institution.findById(institutionObjectId)
      .select("name")
      .lean();

    if (!institution) {
      throw new Error("Institution not found");
    }

    return {
      filter: { institution: institutionObjectId },
      scope: {
        institutionId: institutionIdString(institutionObjectId),
        ...(institution.name ? { institutionName: institution.name } : {}),
        allInstitutions: false,
      },
    };
  }

  if (isAppAdmin) {
    return {
      filter: {},
      scope: { allInstitutions: true },
    };
  }

  const institutionObjectId = new Types.ObjectId(params.user.institution);
  const institution = await Institution.findById(institutionObjectId)
    .select("name")
    .lean();

  return {
    filter: { institution: institutionObjectId },
    scope: {
      institutionId: institutionIdString(institutionObjectId),
      ...(institution?.name ? { institutionName: institution.name } : {}),
      allInstitutions: false,
    },
  };
};

const institutionIdString = (value: Types.ObjectId): string => value.toString();

const groupCount = (
  rows: ScopedAccountRow[],
  selector: (row: ScopedAccountRow) => string,
): Array<{ label: string; count: number }> => {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = normalizeKey(selector(row)) || "unassigned";
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
};

const groupByDate = (
  rows: ScopedAccountRow[],
  selector: (row: ScopedAccountRow) => Date | null | undefined,
): Array<{ date: string; count: number }> => {
  const map = new Map<string, number>();
  for (const row of rows) {
    const date = selector(row);
    if (!date) continue;
    const key = toDateKey(date);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => left.date.localeCompare(right.date));
};

const loadScopedAccounts = async (filter: Record<string, unknown>): Promise<ScopedAccountRow[]> => {
  return Account.find(filter)
    .select(
      "contractNumber accountNumber bankName batchNumber courseOfStudy fullnames graduating status paidDate paidAt institution confirmedBy confirmationDate createdAt updatedAt",
    )
    .lean<ScopedAccountRow[]>();
};

const buildSummary = (rows: ScopedAccountRow[]) => {
  const total = rows.length;
  const confirmed = rows.filter((row) => safeString(row.status).toLowerCase() === "confirmed").length;
  const paid = rows.filter((row) => safeString(row.status).toLowerCase() === "paid").length;
  const unconfirmed = total - confirmed - paid;

  return {
    total,
    confirmed,
    paid,
    unconfirmed: unconfirmed < 0 ? 0 : unconfirmed,
    confirmationRate: total ? Number((confirmed / total).toFixed(4)) : 0,
    paymentRate: total ? Number((paid / total).toFixed(4)) : 0,
  };
};

const buildConfirmedNotPaid = (rows: ScopedAccountRow[]) => {
  const accounts = rows
    .filter((row) => safeString(row.status).toLowerCase() === "confirmed")
    .map((row) => ({
      contractNumber: row.contractNumber,
      accountNumber: row.accountNumber,
      bankName: row.bankName,
      courseOfStudy: row.courseOfStudy,
      fullnames: row.fullnames,
      batchNumber: row.batchNumber,
      confirmationDate: row.confirmationDate || null,
      institution: row.institution.toString(),
    }));

  return { total: accounts.length, accounts };
};

const buildSnapshot = (rows: ScopedAccountRow[], targetStatus: string) => {
  const lowerTarget = targetStatus.toLowerCase();
  const matching = rows.filter((row) => safeString(row.status).toLowerCase() === lowerTarget);
  const others = rows.length - matching.length;

  return {
    total: rows.length,
    matching: matching.length,
    others: others < 0 ? 0 : others,
    rate: rows.length ? Number((matching.length / rows.length).toFixed(4)) : 0,
  };
};

const buildAverageDays = (
  rows: ScopedAccountRow[],
  startSelector: (row: ScopedAccountRow) => Date | null | undefined,
  endSelector: (row: ScopedAccountRow) => Date | null | undefined,
) => {
  const durations = rows
    .map((row) => {
      const start = startSelector(row);
      const end = endSelector(row);
      if (!start || !end) return null;
      return dateDiffDays(start, end);
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);

  const average = durations.length
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : 0;

  return {
    count: durations.length,
    averageDays: Number(average.toFixed(2)),
  };
};

const buildStuckConfirmed = (rows: ScopedAccountRow[], days: number) => {
  const threshold = new Date(Date.now() - days * MS_PER_DAY);
  const accounts = rows.filter((row) => {
    const status = safeString(row.status).toLowerCase();
    return (
      status === "confirmed" &&
      !row.paidAt &&
      !!row.confirmationDate &&
      row.confirmationDate <= threshold
    );
  });

  return {
    thresholdDays: days,
    thresholdDate: threshold.toISOString(),
    total: accounts.length,
    accounts: accounts.map((row) => ({
      contractNumber: row.contractNumber,
      accountNumber: row.accountNumber,
      bankName: row.bankName,
      courseOfStudy: row.courseOfStudy,
      fullnames: row.fullnames,
      confirmationDate: row.confirmationDate || null,
      institution: row.institution.toString(),
    })),
  };
};

const buildRecentPayments = (rows: ScopedAccountRow[], days: number) => {
  const threshold = new Date(Date.now() - days * MS_PER_DAY);
  const paidRows = rows
    .filter((row) => safeString(row.status).toLowerCase() === "paid")
    .filter((row) => row.paidAt && row.paidAt >= threshold)
    .sort((left, right) => (right.paidAt?.getTime() || 0) - (left.paidAt?.getTime() || 0));

  return {
    windowDays: days,
    thresholdDate: threshold.toISOString(),
    total: paidRows.length,
    byDay: groupByDate(paidRows, (row) => row.paidAt || null),
    latest: paidRows.slice(0, DEFAULT_SAMPLE_LIMIT).map((row) => ({
      contractNumber: row.contractNumber,
      accountNumber: row.accountNumber,
      bankName: row.bankName,
      courseOfStudy: row.courseOfStudy,
      fullnames: row.fullnames,
      paidAt: row.paidAt || null,
      institution: row.institution.toString(),
    })),
  };
};

const buildAnomalies = (rows: ScopedAccountRow[]) => {
  const allowedStatuses = new Set(["undefined", "confirmed", "paid"]);
  const anomalies = rows.flatMap((row) => {
    const issues: string[] = [];
    const status = safeString(row.status).toLowerCase();

    if (!allowedStatuses.has(status)) {
      issues.push(`unexpected status: ${row.status}`);
    }
    if (status === "paid" && !row.paidAt) {
      issues.push("paid status without paidAt");
    }
    if (status === "paid" && !row.confirmationDate) {
      issues.push("paid status without confirmationDate");
    }
    if (status === "confirmed" && !row.confirmationDate) {
      issues.push("confirmed status without confirmationDate");
    }
    if (status === "paid" && row.confirmationDate && row.paidAt && row.paidAt < row.confirmationDate) {
      issues.push("paidAt earlier than confirmationDate");
    }
    if (status === "confirmed" && row.paidAt) {
      issues.push("confirmed status already has paidAt");
    }

    if (issues.length === 0) return [];

    return [
      {
        contractNumber: row.contractNumber,
        accountNumber: row.accountNumber,
        bankName: row.bankName,
        courseOfStudy: row.courseOfStudy,
        fullnames: row.fullnames,
        status: row.status,
        issues,
        institution: row.institution.toString(),
      },
    ];
  });

  return {
    total: anomalies.length,
    anomalies,
  };
};

const buildInstitutionBreakdown = async (rows: ScopedAccountRow[]) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.institution.toString();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const institutionIds = [...counts.keys()].map((value) => new Types.ObjectId(value));
  const institutions = institutionIds.length
    ? await Institution.find({ _id: { $in: institutionIds } }).select("name email").lean()
    : [];

  const labelById = new Map<string, { name: string; email: string }>();
  for (const institution of institutions) {
    labelById.set(String((institution as any)._id), {
      name: (institution as any).name,
      email: (institution as any).email,
    });
  }

  return [...counts.entries()]
    .map(([institutionId, count]) => ({
      institutionId,
      institutionName: labelById.get(institutionId)?.name || "Unknown",
      institutionEmail: labelById.get(institutionId)?.email || null,
      count,
    }))
    .sort((left, right) => right.count - left.count || left.institutionName.localeCompare(right.institutionName));
};

const buildReportBundle = async (
  rows: ScopedAccountRow[],
  options: { stuckDays: number; recentDays: number },
) => {
  const confirmedRows = rows.filter((row) => safeString(row.status).toLowerCase() === "confirmed");
  const paidRows = rows.filter((row) => safeString(row.status).toLowerCase() === "paid");

  const byInstitution = await buildInstitutionBreakdown(rows);

  return {
    summary: buildSummary(rows),
    statusBreakdown: groupCount(rows, (row) => row.status || "undefined"),
    confirmationOverview: buildSnapshot(rows, "confirmed"),
    paymentOverview: buildSnapshot(rows, "paid"),
    confirmedNotPaid: buildConfirmedNotPaid(rows),
    byBatch: groupCount(rows, (row) => String(row.batchNumber || "unassigned")),
    byBank: groupCount(rows, (row) => row.bankName),
    byCourse: groupCount(rows, (row) => row.courseOfStudy),
    byGraduating: {
      true: rows.filter((row) => Boolean(row.graduating)).length,
      false: rows.filter((row) => !Boolean(row.graduating)).length,
    },
    byInstitution,
    importsByDay: groupByDate(rows, (row) => row.createdAt || null),
    confirmationsByDay: groupByDate(confirmedRows, (row) => row.confirmationDate || null),
    paymentsByDay: groupByDate(paidRows, (row) => row.paidAt || null),
    averageImportToConfirm: buildAverageDays(rows, (row) => row.createdAt || null, (row) => row.confirmationDate || null),
    averageConfirmToPay: buildAverageDays(rows, (row) => row.confirmationDate || null, (row) => row.paidAt || null),
    stuckConfirmed: buildStuckConfirmed(rows, options.stuckDays),
    recentPayments: buildRecentPayments(rows, options.recentDays),
    anomalies: buildAnomalies(rows),
  };
};

export const getAccountReports = async (params: {
  user: any;
  institutionId?: string | undefined;
  stuckDays?: number;
  recentDays?: number;
}): Promise<AccountReportContext> => {
  const scopeInput: { user: any; institutionId?: string } = { user: params.user };
  if (params.institutionId !== undefined) {
    scopeInput.institutionId = params.institutionId;
  }

  const { filter, scope } = await resolveScope(scopeInput);

  const rows = await loadScopedAccounts(filter);
  const reports = await buildReportBundle(rows, {
    stuckDays: parseNumber(params.stuckDays, DEFAULT_STUCK_DAYS),
    recentDays: parseNumber(params.recentDays, DEFAULT_RECENT_DAYS),
  });

  return {
    scope,
    reports,
    catalog: REPORT_CATALOG,
  };
};

export const getAccountReport = async (params: {
  user: any;
  key: string;
  institutionId?: string | undefined;
  stuckDays?: number;
  recentDays?: number;
}): Promise<{ scope: ReportScope; reportKey: AccountReportKey; report: unknown; catalog: ReportCatalogItem[] }> => {
  const reportKey = normalizeKey(params.key) as AccountReportKey;
  if (!REPORT_KEYS.has(reportKey)) {
    throw new Error(`Unknown report key: ${params.key}`);
  }

  const reportParams: {
    user: any;
    institutionId?: string;
    stuckDays?: number;
    recentDays?: number;
  } = { user: params.user };
  if (params.institutionId !== undefined) {
    reportParams.institutionId = params.institutionId;
  }
  if (params.stuckDays !== undefined) {
    reportParams.stuckDays = params.stuckDays;
  }
  if (params.recentDays !== undefined) {
    reportParams.recentDays = params.recentDays;
  }

  const bundle = await getAccountReports(reportParams);

  const reportMap: Record<string, unknown> = bundle.reports;

  const selected =
    reportKey === "summary"
      ? reportMap.summary
      : reportKey === "status-breakdown"
        ? reportMap.statusBreakdown
        : reportKey === "confirmation-overview"
          ? reportMap.confirmationOverview
          : reportKey === "payment-overview"
            ? reportMap.paymentOverview
            : reportKey === "confirmed-not-paid"
              ? reportMap.confirmedNotPaid
              : reportKey === "by-batch"
                ? reportMap.byBatch
                : reportKey === "by-bank"
                  ? reportMap.byBank
                  : reportKey === "by-course"
                    ? reportMap.byCourse
                    : reportKey === "by-graduating"
                      ? reportMap.byGraduating
                      : reportKey === "by-institution"
                        ? reportMap.byInstitution
                        : reportKey === "imports-by-day"
                          ? reportMap.importsByDay
                          : reportKey === "confirmations-by-day"
                            ? reportMap.confirmationsByDay
                            : reportKey === "payments-by-day"
                              ? reportMap.paymentsByDay
                              : reportKey === "average-import-to-confirm"
                                ? reportMap.averageImportToConfirm
                                : reportKey === "average-confirm-to-pay"
                                  ? reportMap.averageConfirmToPay
                                  : reportKey === "stuck-confirmed"
                                    ? reportMap.stuckConfirmed
                                    : reportKey === "recent-payments"
                                      ? reportMap.recentPayments
                                      : reportMap.anomalies;

  return {
    scope: bundle.scope,
    reportKey,
    report: selected,
    catalog: bundle.catalog,
  };
};
