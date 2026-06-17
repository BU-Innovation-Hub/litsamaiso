import * as XLSX from "xlsx";
import { Types } from "mongoose";
import { Election } from "../models/Election.js";
import { Position, type PositionDocument } from "../models/Position.js";
import { Candidate, type CandidateDocument } from "../models/Candidate.js";
import {
  SRC_POSITION_TEMPLATES,
  getSrcPositionTemplateByLabel,
  normalizePositionLabel,
} from "../constants/srcPositions.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { ensureDefaultSrcPositions } from "./positionService.js";

type SpreadsheetRow = Record<string, unknown>;

type CandidateImportRecord = {
  rowNumber: number;
  positionLabel: string;
  fullName: string;
  studentId?: string;
  party?: string;
  manifesto?: string;
  imageUrl?: string;
  approved?: boolean;
};

type ImportWarning = {
  rowNumber?: number;
  column?: string;
  message: string;
};

type PositionField = "candidate" | "studentId" | "party" | "manifesto" | "imageUrl" | "approved";

type PositionColumnGroup = {
  positionTitle: string;
  columns: Partial<Record<PositionField, string>>;
};

const EDITABLE_STATUSES = new Set(["DRAFT", "SCHEDULED"]);

const FIELD_ALIASES: Record<PositionField, string[]> = {
  candidate: ["candidate", "candidate name", "name", "full name", "fullname", "student name"],
  studentId: ["student id", "studentid", "student number", "student no", "registration number", "reg no", "id number"],
  party: ["party", "organization", "organisation", "movement", "association"],
  manifesto: ["manifesto", "description", "bio", "profile", "statement"],
  imageUrl: ["image", "image url", "photo", "photo url", "candidate photo"],
  approved: ["approved", "approval", "status"],
};

const POSITION_ALIASES = ["position", "office", "post", "portfolio", "role", "src position"];

const normalizeHeader = (value: string): string =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const optionalCellString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  return str ? str : undefined;
};

const parseBooleanCell = (value: unknown): boolean | undefined => {
  const str = optionalCellString(value);
  if (!str) return undefined;
  const normalized = normalizeHeader(str);
  if (["true", "yes", "y", "1", "approved", "approve"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0", "pending", "rejected", "not approved"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const splitCandidateNames = (value: unknown): string[] => {
  const str = optionalCellString(value);
  if (!str) return [];
  return str
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const cellIsEmpty = (value: unknown): boolean => optionalCellString(value) === undefined;

const rowHasValue = (row: SpreadsheetRow): boolean =>
  Object.values(row).some((value) => !cellIsEmpty(value));

const findColumn = (headers: string[], aliases: string[]): string | undefined => {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.find((header) => {
    const normalizedHeader = normalizeHeader(header);
    return normalizedAliases.some(
      (alias) =>
        normalizedHeader === alias ||
        normalizedHeader.includes(alias) ||
        alias.includes(normalizedHeader),
    );
  });
};

const detectField = (header: string, inferredAsCandidate: boolean): PositionField => {
  if (inferredAsCandidate) return "candidate";
  const normalized = normalizeHeader(header);

  const fields: PositionField[] = ["studentId", "party", "manifesto", "imageUrl", "approved", "candidate"];
  for (const field of fields) {
    if (FIELD_ALIASES[field].some((alias) => normalized.includes(normalizeHeader(alias)))) {
      return field;
    }
  }

  return "candidate";
};

const buildPositionMatcher = (positions: PositionDocument[]) => {
  const titleByNormalized = new Map<string, string>();
  positions.forEach((position) => {
    titleByNormalized.set(normalizePositionLabel(position.title), position.title);
  });

  return (label: string): string | null => {
    const normalized = normalizePositionLabel(label);
    if (!normalized) return null;

    const direct = titleByNormalized.get(normalized);
    if (direct) return direct;

    for (const [key, title] of titleByNormalized.entries()) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return title;
      }
    }

    const template = getSrcPositionTemplateByLabel(label);
    if (!template) return null;
    return titleByNormalized.get(normalizePositionLabel(template.title)) || template.title;
  };
};

const parseWorkbookRows = (fileBuffer: Buffer): SpreadsheetRow[] => {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new AppError("Spreadsheet has no worksheets", 400);

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) throw new AppError("Spreadsheet worksheet could not be read", 400);

  return XLSX.utils
    .sheet_to_json<SpreadsheetRow>(worksheet, { defval: "", raw: false })
    .filter(rowHasValue);
};

const parseLongRows = (params: {
  rows: SpreadsheetRow[];
  positionColumn: string;
  candidateColumn: string;
}): { records: CandidateImportRecord[]; warnings: ImportWarning[] } => {
  const warnings: ImportWarning[] = [];
  const records: CandidateImportRecord[] = [];
  const headers = Object.keys(params.rows[0] || {});

  const studentIdColumn = findColumn(headers, FIELD_ALIASES.studentId);
  const partyColumn = findColumn(headers, FIELD_ALIASES.party);
  const manifestoColumn = findColumn(headers, FIELD_ALIASES.manifesto);
  const imageUrlColumn = findColumn(headers, FIELD_ALIASES.imageUrl);
  const approvedColumn = findColumn(headers, FIELD_ALIASES.approved);

  params.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const positionLabel = optionalCellString(row[params.positionColumn]);
    const candidateNames = splitCandidateNames(row[params.candidateColumn]);

    if (!positionLabel && candidateNames.length > 0) {
      warnings.push({ rowNumber, message: "Skipped candidate because position is missing" });
      return;
    }
    if (positionLabel && candidateNames.length === 0) {
      warnings.push({ rowNumber, message: "Skipped row because candidate name is missing" });
      return;
    }

    candidateNames.forEach((fullName) => {
      const record: CandidateImportRecord = {
        rowNumber,
        positionLabel: positionLabel || "",
        fullName,
      };
      const studentId = studentIdColumn ? optionalCellString(row[studentIdColumn]) : undefined;
      const party = partyColumn ? optionalCellString(row[partyColumn]) : undefined;
      const manifesto = manifestoColumn ? optionalCellString(row[manifestoColumn]) : undefined;
      const imageUrl = imageUrlColumn ? optionalCellString(row[imageUrlColumn]) : undefined;
      const approved = approvedColumn ? parseBooleanCell(row[approvedColumn]) : undefined;
      if (studentId !== undefined) record.studentId = studentId;
      if (party !== undefined) record.party = party;
      if (manifesto !== undefined) record.manifesto = manifesto;
      if (imageUrl !== undefined) record.imageUrl = imageUrl;
      if (approved !== undefined) record.approved = approved;
      records.push(record);
    });
  });

  return { records, warnings };
};

const buildWideColumnGroups = (headers: string[], positions: PositionDocument[]): PositionColumnGroup[] => {
  const matchPosition = buildPositionMatcher(positions);
  const groups = new Map<string, PositionColumnGroup>();

  headers.forEach((header) => {
    const positionTitle = matchPosition(header);
    if (!positionTitle) return;

    const normalizedHeader = normalizePositionLabel(header);
    const normalizedPosition = normalizePositionLabel(positionTitle);
    const inferredAsCandidate = normalizedHeader === normalizedPosition;
    const field = detectField(header, inferredAsCandidate);
    const group = groups.get(positionTitle) || { positionTitle, columns: {} };

    if (!group.columns[field]) {
      group.columns[field] = header;
    }
    groups.set(positionTitle, group);
  });

  return Array.from(groups.values()).filter((group) => group.columns.candidate);
};

const parseWideRows = (params: {
  rows: SpreadsheetRow[];
  positions: PositionDocument[];
}): { records: CandidateImportRecord[]; warnings: ImportWarning[]; mappedColumns: Array<{ position: string; columns: Partial<Record<PositionField, string>> }> } => {
  const headers = Object.keys(params.rows[0] || {});
  const groups = buildWideColumnGroups(headers, params.positions);
  const warnings: ImportWarning[] = [];
  const records: CandidateImportRecord[] = [];

  if (groups.length === 0) {
    warnings.push({
      message:
        "No candidate columns matched seeded SRC positions. Use Position/Candidate columns or columns named after SRC positions.",
    });
  }

  params.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    groups.forEach((group) => {
      const candidateColumn = group.columns.candidate;
      if (!candidateColumn) return;

      const candidateNames = splitCandidateNames(row[candidateColumn]);
      if (candidateNames.length === 0) return;

      candidateNames.forEach((fullName) => {
        const record: CandidateImportRecord = {
          rowNumber,
          positionLabel: group.positionTitle,
          fullName,
        };
        const studentId = group.columns.studentId ? optionalCellString(row[group.columns.studentId]) : undefined;
        const party = group.columns.party ? optionalCellString(row[group.columns.party]) : undefined;
        const manifesto = group.columns.manifesto ? optionalCellString(row[group.columns.manifesto]) : undefined;
        const imageUrl = group.columns.imageUrl ? optionalCellString(row[group.columns.imageUrl]) : undefined;
        const approved = group.columns.approved ? parseBooleanCell(row[group.columns.approved]) : undefined;
        if (studentId !== undefined && candidateNames.length === 1) record.studentId = studentId;
        if (party !== undefined && candidateNames.length === 1) record.party = party;
        if (manifesto !== undefined && candidateNames.length === 1) record.manifesto = manifesto;
        if (imageUrl !== undefined && candidateNames.length === 1) record.imageUrl = imageUrl;
        if (approved !== undefined) record.approved = approved;
        records.push(record);
      });
    });
  });

  return {
    records,
    warnings,
    mappedColumns: groups.map((group) => ({
      position: group.positionTitle,
      columns: group.columns,
    })),
  };
};

const parseCandidateImport = (params: {
  fileBuffer: Buffer;
  positions: PositionDocument[];
}): {
  rowsRead: number;
  records: CandidateImportRecord[];
  warnings: ImportWarning[];
  mappedColumns: Array<{ position: string; columns: Partial<Record<PositionField, string>> }>;
} => {
  const rows = parseWorkbookRows(params.fileBuffer);
  if (rows.length === 0) {
    throw new AppError("Spreadsheet has no data rows", 400);
  }

  const headers = Object.keys(rows[0] || {});
  const positionColumn = findColumn(headers, POSITION_ALIASES);
  const candidateColumn = findColumn(headers, FIELD_ALIASES.candidate);

  if (positionColumn && candidateColumn) {
    const parsed = parseLongRows({ rows, positionColumn, candidateColumn });
    return {
      rowsRead: rows.length,
      records: parsed.records,
      warnings: parsed.warnings,
      mappedColumns: [
        {
          position: "Position column",
          columns: {
            candidate: candidateColumn,
          },
        },
      ],
    };
  }

  const parsed = parseWideRows({ rows, positions: params.positions });
  return {
    rowsRead: rows.length,
    records: parsed.records,
    warnings: parsed.warnings,
    mappedColumns: parsed.mappedColumns,
  };
};

const candidateNameKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isEditableElection = (status: string): boolean => EDITABLE_STATUSES.has(status);

export const importCandidatesFromSpreadsheet = async (params: {
  user: any;
  electionId: string;
  fileBuffer: Buffer;
  fileName?: string;
  approveImported?: boolean;
}): Promise<{
  summary: {
    rowsRead: number;
    parsedCandidates: number;
    importedCandidates: number;
    skippedCandidates: number;
    warnings: ImportWarning[];
    mappedColumns: Array<{ position: string; columns: Partial<Record<PositionField, string>> }>;
  };
  candidates: CandidateDocument[];
}> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);
  if (!isEditableElection(election.status)) {
    throw new AppError("Election is frozen and candidates cannot be imported", 400);
  }

  await ensureDefaultSrcPositions({ user: params.user, electionId: params.electionId });

  const positions = await Position.find({
    electionId: election._id,
    deletedAt: null,
  }).sort({ displayOrder: 1 });
  const positionByTitle = new Map(
    positions.map((position) => [normalizePositionLabel(position.title), position]),
  );
  const matchPosition = buildPositionMatcher(positions);

  const parsed = parseCandidateImport({
    fileBuffer: params.fileBuffer,
    positions,
  });

  const warnings = [...parsed.warnings];
  const existingCandidates = await Candidate.find({
    electionId: election._id,
    deletedAt: null,
  }).lean();
  const seenKeys = new Set<string>();
  const existingKeys = new Set<string>();

  existingCandidates.forEach((candidate) => {
    const positionId = candidate.positionId.toString();
    if (candidate.studentId) {
      existingKeys.add(`${positionId}:student:${candidate.studentId.toLowerCase()}`);
    }
    existingKeys.add(`${positionId}:name:${candidateNameKey(candidate.fullName)}`);
  });

  const payloads: Array<Record<string, unknown>> = [];

  parsed.records.forEach((record) => {
    const matchedTitle = matchPosition(record.positionLabel);
    if (!matchedTitle) {
      warnings.push({
        rowNumber: record.rowNumber,
        message: `Skipped ${record.fullName}: position "${record.positionLabel}" did not match a seeded or existing position`,
      });
      return;
    }

    const position = positionByTitle.get(normalizePositionLabel(matchedTitle));
    if (!position) {
      warnings.push({
        rowNumber: record.rowNumber,
        message: `Skipped ${record.fullName}: matched position "${matchedTitle}" is not available on this election`,
      });
      return;
    }

    if (record.fullName.trim().length < 3) {
      warnings.push({
        rowNumber: record.rowNumber,
        message: "Skipped candidate because full name is shorter than 3 characters",
      });
      return;
    }

    const positionId = position._id.toString();
    const uniqueKey = record.studentId
      ? `${positionId}:student:${record.studentId.toLowerCase()}`
      : `${positionId}:name:${candidateNameKey(record.fullName)}`;
    const nameKey = `${positionId}:name:${candidateNameKey(record.fullName)}`;

    if (seenKeys.has(uniqueKey) || seenKeys.has(nameKey)) {
      warnings.push({
        rowNumber: record.rowNumber,
        message: `Skipped duplicate candidate in file: ${record.fullName} for ${position.title}`,
      });
      return;
    }
    if (existingKeys.has(uniqueKey) || existingKeys.has(nameKey)) {
      warnings.push({
        rowNumber: record.rowNumber,
        message: `Skipped existing candidate: ${record.fullName} for ${position.title}`,
      });
      return;
    }

    seenKeys.add(uniqueKey);
    seenKeys.add(nameKey);

    const payload: Record<string, unknown> = {
      electionId: election._id,
      positionId: position._id,
      fullName: record.fullName.trim(),
      approved: Boolean(params.approveImported || record.approved),
      disqualified: false,
    };
    if (record.studentId !== undefined) payload.studentId = record.studentId;
    if (record.party !== undefined) payload.party = record.party;
    if (record.manifesto !== undefined) payload.manifesto = record.manifesto;
    if (record.imageUrl !== undefined) payload.imageUrl = record.imageUrl;
    payloads.push(payload);
  });

  const candidates = payloads.length
    ? await Candidate.insertMany(payloads, { ordered: false })
    : [];

  await recordAudit({
    action: "candidate.import",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Election",
    targetId: election._id?.toString(),
    details: {
      fileName: params.fileName,
      rowsRead: parsed.rowsRead,
      parsedCandidates: parsed.records.length,
      importedCandidates: candidates.length,
      skippedCandidates: parsed.records.length - candidates.length,
    },
  });

  return {
    summary: {
      rowsRead: parsed.rowsRead,
      parsedCandidates: parsed.records.length,
      importedCandidates: candidates.length,
      skippedCandidates: parsed.records.length - candidates.length,
      warnings,
      mappedColumns: parsed.mappedColumns,
    },
    candidates: candidates as CandidateDocument[],
  };
};
