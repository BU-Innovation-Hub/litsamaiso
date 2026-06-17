import { Types } from "mongoose";
import { Election } from "../models/Election.js";
import { Position, type PositionDocument } from "../models/Position.js";
import { SRC_POSITION_TEMPLATES, normalizePositionLabel } from "../constants/srcPositions.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";
import { optionalString, requireNumber, requireString } from "../utils/validation.js";

const ensureEditable = (status: string): void => {
  if (["OPEN", "CLOSED", "COUNTING", "RESULTS_PUBLISHED", "ARCHIVED"].includes(status)) {
    throw new AppError("Election is frozen and positions cannot be edited", 400);
  }
};
// Service functions for managing positions within an election, including creating, updating, soft deleting, and retrieving positions. These functions also include necessary checks for election status and user permissions, as well as audit logging for changes made to positions.
export const createPosition = async (params: {
  user: any;
  electionId: string;
  title: unknown;
  description?: unknown;
  maxVotesAllowed?: unknown;
  displayOrder?: unknown;
}): Promise<PositionDocument> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election.status);

  const title = requireString(params.title, "title", { min: 2 });
  const description = optionalString(params.description);
  const maxVotesAllowed =
    params.maxVotesAllowed !== undefined
      ? requireNumber(params.maxVotesAllowed, "maxVotesAllowed", { min: 1 })
      : 1;

  let displayOrder: number;
  if (params.displayOrder !== undefined) {
    displayOrder = requireNumber(params.displayOrder, "displayOrder", { min: 1 });
  } else {
    const last = await Position.findOne({
      electionId: election._id,
      deletedAt: null,
    })
      .sort({ displayOrder: -1 })
      .lean();
    displayOrder = (last?.displayOrder || 0) + 1;
  }

  const position = await Position.create({
    electionId: election._id,
    title,
    ...(description !== undefined && { description }),
    maxVotesAllowed,
    displayOrder,
    isActive: true,
  });

  await recordAudit({
    action: "position.create",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Position",
    targetId: (position as any)._id?.toString(),
    details: { electionId: election._id?.toString(), title },
  });

  return position;
};

export const ensureDefaultSrcPositions = async (params: {
  user?: any;
  electionId: string;
}): Promise<PositionDocument[]> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    ...(params.user?.institution && { institution: params.user.institution }),
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election.status);

  const existing = await Position.find({
    electionId: election._id,
    deletedAt: null,
  }).sort({ displayOrder: 1 });

  const existingTitleKeys = new Set(
    existing.map((position) => normalizePositionLabel(position.title)),
  );
  const usedOrders = new Set(existing.map((position) => position.displayOrder));
  const created: PositionDocument[] = [];

  const nextAvailableOrder = (preferred: number): number => {
    let order = preferred;
    while (usedOrders.has(order)) order += 1;
    usedOrders.add(order);
    return order;
  };

  for (const template of SRC_POSITION_TEMPLATES) {
    const titleKey = normalizePositionLabel(template.title);
    if (existingTitleKeys.has(titleKey)) continue;

    const position = await Position.create({
      electionId: election._id,
      title: template.title,
      description: template.description,
      maxVotesAllowed: 1,
      displayOrder: nextAvailableOrder(template.displayOrder),
      isActive: true,
    });
    created.push(position);
    existingTitleKeys.add(titleKey);
  }

  if (created.length > 0) {
    await recordAudit({
      action: "position.seed-src-defaults",
      actorId: params.user?._id?.toString(),
      actorEmail: params.user?.email,
      actorRole: (params.user?.role && (params.user.role as any).name) || params.user?.role,
      targetCollection: "Election",
      targetId: election._id?.toString(),
      details: { count: created.length },
    });
  }

  return created;
};
// Service function to update a position's details, with checks for election status and audit logging of the update action
export const updatePosition = async (params: {
  user: any;
  positionId: string;
  updates: Record<string, unknown>;
}): Promise<PositionDocument> => {
  const position = await Position.findOne({
    _id: params.positionId,
    deletedAt: null,
  });
  if (!position) throw new AppError("Position not found", 404);

  const election = await Election.findOne({
    _id: position.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election.status);

  if (params.updates.title !== undefined) {
    position.title = requireString(params.updates.title, "title", { min: 2 });
  }
  if (params.updates.description !== undefined) {
    const v = optionalString(params.updates.description);
    if (v !== undefined) position.description = v;
  }
  if (params.updates.maxVotesAllowed !== undefined) {
    position.maxVotesAllowed = requireNumber(
      params.updates.maxVotesAllowed,
      "maxVotesAllowed",
      { min: 1 },
    );
  }
  if (params.updates.displayOrder !== undefined) {
    position.displayOrder = requireNumber(params.updates.displayOrder, "displayOrder", { min: 1 });
  }
  if (params.updates.isActive !== undefined) {
    position.isActive = Boolean(params.updates.isActive);
  }

  await position.save();

  await recordAudit({
    action: "position.update",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Position",
    targetId: position._id?.toString(),
    details: { updates: Object.keys(params.updates) },
  });

  return position;
};

// Service function to soft delete a position, marking it as deleted and recording an audit log of the deletion action
export const softDeletePosition = async (params: {
  user: any;
  positionId: string;
}): Promise<void> => {
  const position = await Position.findOne({
    _id: params.positionId,
    deletedAt: null,
  });
  if (!position) throw new AppError("Position not found", 404);

  const election = await Election.findOne({
    _id: position.electionId,
    deletedAt: null,
    institution: params.user.institution,
  });
  if (!election) throw new AppError("Election not found", 404);

  ensureEditable(election.status);

  position.deletedAt = new Date();
  position.deletedBy = new Types.ObjectId(params.user._id);
  await position.save();

  await recordAudit({
    action: "position.delete",
    actorId: params.user._id?.toString(),
    actorEmail: params.user.email,
    actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
    targetCollection: "Position",
    targetId: position._id?.toString(),
  });
};

const resolveRoleName = (user: any): string => {
  const resolved =
    (user?.role && (user.role as any).name) || (user?.role as string) || "";
  return String(resolved).toLowerCase();
};

const ensureStudentCanView = (election: { published?: boolean; archived?: boolean }): void => {
  if (!election.published || election.archived) {
    throw new AppError("Election is not available", 403);
  }
};
// Service function to retrieve a position by its ID, with checks for election status and user permissions
export const getPositionById = async (params: {
  user: any;
  positionId: string;
}): Promise<PositionDocument> => {
  const position = await Position.findOne({
    _id: params.positionId,
    deletedAt: null,
  }).lean();
  if (!position) throw new AppError("Position not found", 404);

  const election = await Election.findOne({
    _id: position.electionId,
    deletedAt: null,
    institution: params.user.institution,
  }).lean();
  if (!election) throw new AppError("Election not found", 404);

  const roleName = resolveRoleName(params.user);
  if (roleName === "student") {
    ensureStudentCanView(election);
    if (!position.isActive) {
      throw new AppError("Position is not available", 403);
    }
  }

  return position as PositionDocument;
};
// Service function to list positions for a specific election, with visibility based on user role and election status
export const listPositionsByElection = async (params: {
  user: any;
  electionId: string;
}): Promise<PositionDocument[]> => {
  const election = await Election.findOne({
    _id: params.electionId,
    deletedAt: null,
    institution: params.user.institution,
  }).lean();
  if (!election) throw new AppError("Election not found", 404);

  const roleName = resolveRoleName(params.user);
  if (roleName === "student") {
    ensureStudentCanView(election);
  }

  const filter: Record<string, unknown> = {
    electionId: election._id,
    deletedAt: null,
  };
  if (roleName === "student") {
    filter.isActive = true;
  }

  return Position.find(filter).sort({ displayOrder: 1 }).lean();
};
