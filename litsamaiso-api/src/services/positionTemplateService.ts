import { Types } from "mongoose";
import { Position } from "../models/Position.js";
import { PositionTemplate, type PositionTemplateDocument } from "../models/PositionTemplate.js";
import { SRC_POSITION_TEMPLATES, normalizePositionLabel } from "../constants/srcPositions.js";
import { recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";

const requireInstitution = (user: any): Types.ObjectId => {
  if (!user?.institution) throw new AppError("User is not linked to an institution", 400);
  return new Types.ObjectId(user.institution);
};

// Service function to list the institution's standard positions in display order
export const listPositionTemplates = async (params: {
  user: any;
}): Promise<PositionTemplateDocument[]> => {
  const institution = requireInstitution(params.user);
  return PositionTemplate.find({ institution }).sort({ displayOrder: 1 }).lean();
};

// Service function to import the fixed SRC positions into the institution's standard list, skipping any already present
export const importSrcPositionTemplates = async (params: {
  user: any;
}): Promise<{ created: number; templates: PositionTemplateDocument[] }> => {
  const institution = requireInstitution(params.user);

  const existing = await PositionTemplate.find({ institution }).lean();
  const existingTitleKeys = new Set(existing.map((template) => normalizePositionLabel(template.title)));
  const usedOrders = new Set(existing.map((template) => template.displayOrder));

  const nextAvailableOrder = (preferred: number): number => {
    let order = preferred;
    while (usedOrders.has(order)) order += 1;
    usedOrders.add(order);
    return order;
  };

  const payloads = SRC_POSITION_TEMPLATES.filter(
    (template) => !existingTitleKeys.has(normalizePositionLabel(template.title)),
  ).map((template) => ({
    institution,
    title: template.title,
    description: template.description,
    maxVotesAllowed: 1,
    displayOrder: nextAvailableOrder(template.displayOrder),
  }));

  if (payloads.length > 0) {
    await PositionTemplate.insertMany(payloads);
    await recordAudit({
      action: "position-template.import-src",
      actorId: params.user._id?.toString(),
      actorEmail: params.user.email,
      actorRole: (params.user.role && (params.user.role as any).name) || params.user.role,
      targetCollection: "PositionTemplate",
      details: { count: payloads.length },
    });
  }

  const templates = await listPositionTemplates({ user: params.user });
  return { created: payloads.length, templates };
};

// Service function to copy the institution's standard positions onto a newly created election
export const copyPositionTemplatesToElection = async (params: {
  institution: Types.ObjectId;
  electionId: Types.ObjectId;
}): Promise<number> => {
  const templates = await PositionTemplate.find({ institution: params.institution })
    .sort({ displayOrder: 1 })
    .lean();
  if (templates.length === 0) return 0;

  await Position.insertMany(
    templates.map((template) => ({
      electionId: params.electionId,
      title: template.title,
      ...(template.description && { description: template.description }),
      maxVotesAllowed: 1,
      displayOrder: template.displayOrder,
      isActive: true,
    })),
  );
  return templates.length;
};
