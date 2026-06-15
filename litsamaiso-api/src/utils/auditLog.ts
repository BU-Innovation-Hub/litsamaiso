import { AuditLog } from "../models/AuditLog.js";

export const recordAudit = async (options: {
  action: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  targetCollection?: string;
  targetId?: string;
  details?: Record<string, any>;
}) => {
  try {
    const payload: Record<string, any> = { action: options.action };
    if (options.actorId !== undefined) payload.actorId = options.actorId;
    if (options.actorEmail !== undefined) payload.actorEmail = options.actorEmail;
    if (options.actorRole !== undefined) payload.actorRole = options.actorRole;
    if (options.targetCollection !== undefined) payload.targetCollection = options.targetCollection;
    if (options.targetId !== undefined) payload.targetId = options.targetId;
    if (options.details !== undefined) payload.details = options.details;

    await AuditLog.create(payload);
  } catch (err) {
    console.error("Failed to record audit:", err);
  }
};

export default recordAudit;
