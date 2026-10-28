import { Candidate } from "../models/Candidate.js";
import { Election, type ElectionStatus } from "../models/Election.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { auditActor, recordAudit } from "../utils/auditLog.js";
import AppError from "../utils/errors.js";

// Students appointed to the Independent Electoral Commission run elections alongside SAAD.
// They keep their Student role and hold IEC as an additional one.
export const IEC_ROLE_NAME = "IEC";

// Elections that haven't finished yet; standing in one of these conflicts with being on the IEC
const RUNNING_STATUSES: ElectionStatus[] = ["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "COUNTING"];

const findIecRole = async () => {
  const role = await Role.findOne({ name: new RegExp(`^${IEC_ROLE_NAME}$`, "i") });
  if (!role) throw new AppError("IEC role is missing; restart the API to seed it", 500);
  return role;
};

// The student IDs, out of those given, whose accounts are on the institution's IEC
export const iecStudentIds = async (institution: any, studentIds: string[]): Promise<Set<string>> => {
  if (studentIds.length === 0) return new Set();
  const role = await Role.findOne({ name: new RegExp(`^${IEC_ROLE_NAME}$`, "i") }).select("_id").lean();
  if (!role) return new Set();
  const members = await User.find({
    institution,
    studentId: { $in: studentIds },
    additionalRoles: role._id,
  })
    .select("studentId")
    .lean();
  return new Set(members.map((member) => String(member.studentId)));
};

// The IEC runs the election, so its members can't also stand in one
export const ensureNotIecMember = async (institution: any, studentId: string): Promise<void> => {
  const members = await iecStudentIds(institution, [studentId]);
  if (members.has(studentId)) {
    throw new AppError(
      `Student ${studentId} is on the IEC and cannot stand as a candidate. Remove them from the IEC first.`,
      400,
    );
  }
};

const loadStudent = async (userId: string) => {
  const user = await User.findById(userId).populate("role", "name");
  if (!user) throw new AppError("User not found", 404);
  const roleName = String((user.role as any)?.name || "").toLowerCase();
  if (roleName !== "student" || !user.studentId) {
    throw new AppError("Only student accounts can be appointed to the IEC", 400);
  }
  return user;
};

export const appointIecMember = async (params: { actor: any; userId: string }) => {
  const [user, role] = await Promise.all([loadStudent(params.userId), findIecRole()]);

  const running = await Election.find({
    institution: user.institution,
    deletedAt: null,
    archived: false,
    status: { $in: RUNNING_STATUSES },
  })
    .select("_id")
    .lean();
  const standing = running.length
    ? await Candidate.exists({
        electionId: { $in: running.map((election) => election._id) },
        studentId: String(user.studentId),
        deletedAt: null,
      })
    : null;
  if (standing) {
    throw new AppError(
      "This student is a candidate in an election that hasn't finished, so they can't join the IEC",
      400,
    );
  }

  await User.updateOne({ _id: user._id }, { $addToSet: { additionalRoles: role._id } });
  await recordAudit({
    ...auditActor(params.actor),
    action: "user.iec.appoint",
    targetCollection: "User",
    targetId: String(user._id),
    details: { studentId: user.studentId },
  });
};

export const removeIecMember = async (params: { actor: any; userId: string }) => {
  const [user, role] = await Promise.all([loadStudent(params.userId), findIecRole()]);

  await User.updateOne({ _id: user._id }, { $pull: { additionalRoles: role._id } });
  await recordAudit({
    ...auditActor(params.actor),
    action: "user.iec.remove",
    targetCollection: "User",
    targetId: String(user._id),
    details: { studentId: user.studentId },
  });
};
