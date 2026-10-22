import { AuditLog } from "../models/AuditLog.js";

type AuditActor = { actorId?: string; actorEmail?: string; actorRole?: string };

// Who did it, from a user document such as req.user. The role is recorded only when it's
// populated (or already a name); an unpopulated role id says nothing to someone reading the log.
export const auditActor = (user: any): AuditActor => {
  const actor: AuditActor = {};
  if (!user) return actor;
  if (user._id) actor.actorId = String(user._id);
  if (user.email) actor.actorEmail = String(user.email);
  const role = typeof user.role === "string" ? user.role : user.role?.name;
  if (role) actor.actorRole = String(role);
  return actor;
};

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
