import mongoose from "mongoose";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { recordAudit } from "../utils/auditLog.js";

type Actor = { _id: unknown; email?: string; role?: any };

export class BorrowerAssignmentError extends Error {
  code: "borrower_conflict" | "user_conflict" | "student_not_found";

  constructor(code: BorrowerAssignmentError["code"], message: string) {
    super(message);
    this.name = "BorrowerAssignmentError";
    this.code = code;
  }
}

type AssignmentResult = {
  studentId: string;
  borrowerNumber: string;
  userId?: string;
  userSynchronized: boolean;
  alreadyAssigned: boolean;
};

const actorRole = (actor: Actor) => String((actor.role && actor.role.name) || actor.role || "");
const asId = (value: unknown) => String(value);

const findStudentUser = async (institution: unknown, studentId: string, session?: mongoose.ClientSession) => {
  let query = (User as any).findOne({ institution, studentId }).populate("role", "name");
  if (session) query = query.session(session);
  const user: any = await query;
  if (!user) return null;
  const role = String(user.role?.name || user.role || "").toLowerCase();
  return role && role !== "student" ? null : user;
};

const assertAssignment = async (institution: unknown, student: any, borrowerNumber: string, session?: mongoose.ClientSession) => {
  let ownerQuery = (Student as any).findOne({ institution, borrowerNumber, _id: { $ne: student._id } });
  if (session) ownerQuery = ownerQuery.session(session);
  if (await ownerQuery.lean()) {
    throw new BorrowerAssignmentError("borrower_conflict", `Borrower number "${borrowerNumber}" is already assigned to another student.`);
  }

  if (student.borrowerNumber && String(student.borrowerNumber).trim() !== borrowerNumber) {
    throw new BorrowerAssignmentError("borrower_conflict", `This student already has borrower number "${String(student.borrowerNumber).trim()}"; it cannot be changed to "${borrowerNumber}" here.`);
  }

  const user = await findStudentUser(institution, String(student.studentId), session);
  if (user?.borrowerNumber && String(user.borrowerNumber).trim() !== borrowerNumber) {
    throw new BorrowerAssignmentError("user_conflict", `The student account already has borrower number "${String(user.borrowerNumber).trim()}"; it cannot be changed to "${borrowerNumber}" here.`);
  }

  return user;
};

const assignInSession = async (institution: unknown, studentId: string, borrowerNumber: string, session: mongoose.ClientSession) => {
  const student: any = await (Student as any).findOne({ _id: studentId, institution }).session(session);
  if (!student) throw new BorrowerAssignmentError("student_not_found", "Student not found in the institution");
  const user = await assertAssignment(institution, student, borrowerNumber, session);
  const alreadyAssigned = String(student.borrowerNumber || "").trim() === borrowerNumber;

  if (!alreadyAssigned) {
    const update = await (Student as any).updateOne(
      { _id: student._id, institution, borrowerNumber: { $in: [null, ""] } },
      { $set: { borrowerNumber } },
      { session },
    );
    if (update.modifiedCount !== 1) {
      throw new BorrowerAssignmentError("borrower_conflict", "Borrower number assignment changed before it could be applied");
    }
  }

  let userSynchronized = false;
  if (user && String(user.borrowerNumber || "").trim() !== borrowerNumber) {
    const update = await (User as any).updateOne(
      { _id: user._id, institution, studentId: student.studentId, borrowerNumber: { $in: [null, ""] } },
      { $set: { borrowerNumber } },
      { session },
    );
    if (update.modifiedCount !== 1) {
      throw new BorrowerAssignmentError("user_conflict", "Student user borrower number changed before synchronization");
    }
    userSynchronized = true;
  }

  return { studentId: asId(student._id), borrowerNumber, ...(user ? { userId: asId(user._id) } : {}), userSynchronized, alreadyAssigned };
};

const assignWithoutTransaction = async (institution: unknown, studentId: string, borrowerNumber: string): Promise<AssignmentResult> => {
  const student: any = await (Student as any).findOne({ _id: studentId, institution });
  if (!student) throw new BorrowerAssignmentError("student_not_found", "Student not found in the institution");
  const user = await assertAssignment(institution, student, borrowerNumber);
  const alreadyAssigned = String(student.borrowerNumber || "").trim() === borrowerNumber;
  let studentChanged = false;

  if (!alreadyAssigned) {
    const update = await (Student as any).updateOne({ _id: student._id, institution, borrowerNumber: { $in: [null, ""] } }, { $set: { borrowerNumber } });
    if (update.modifiedCount !== 1) throw new BorrowerAssignmentError("borrower_conflict", "Borrower number assignment changed before it could be applied");
    studentChanged = true;
  }

  let userSynchronized = false;
  try {
    if (user && String(user.borrowerNumber || "").trim() !== borrowerNumber) {
      const update = await (User as any).updateOne({ _id: user._id, institution, studentId: student.studentId, borrowerNumber: { $in: [null, ""] } }, { $set: { borrowerNumber } });
      if (update.modifiedCount !== 1) throw new BorrowerAssignmentError("user_conflict", "Student user borrower number changed before synchronization");
      userSynchronized = true;
    }
  } catch (error) {
    if (studentChanged) await (Student as any).updateOne({ _id: student._id, institution, borrowerNumber }, { $unset: { borrowerNumber: 1 } });
    throw error;
  }

  return { studentId: asId(student._id), borrowerNumber, ...(user ? { userId: asId(user._id) } : {}), userSynchronized, alreadyAssigned };
};

export const assignBorrowerNumber = async (input: { institution: unknown; studentId: string; borrowerNumber: string; actor?: Actor; details?: Record<string, unknown>; session?: mongoose.ClientSession }): Promise<AssignmentResult> => {
  const borrowerNumber = String(input.borrowerNumber || "").trim();
  if (!borrowerNumber) throw new BorrowerAssignmentError("borrower_conflict", "Borrower number is required");

  if (input.session) {
    const result = await assignInSession(input.institution, input.studentId, borrowerNumber, input.session);
    if (input.actor) {
      await recordAudit({
        action: "registry.borrower.synchronized",
        actorId: asId(input.actor._id),
        ...(input.actor.email ? { actorEmail: input.actor.email } : {}),
        actorRole: actorRole(input.actor),
        targetCollection: "Student",
        targetId: result.studentId,
        details: { borrowerNumber, userId: result.userId, userSynchronized: result.userSynchronized, alreadyAssigned: result.alreadyAssigned, ...(input.details || {}) },
      });
    }
    return result;
  }

  const session = await mongoose.startSession();
  try {
    let result!: AssignmentResult;
    try {
      await session.withTransaction(async () => {
        result = await assignInSession(input.institution, input.studentId, borrowerNumber, session);
      });
    } catch (error) {
      const message = String((error as Error)?.message || error).toLowerCase();
      if (!message.includes("transaction") && !message.includes("replica set") && !message.includes("topology")) throw error;
      result = await assignWithoutTransaction(input.institution, input.studentId, borrowerNumber);
    }

    if (input.actor) {
      await recordAudit({
        action: "registry.borrower.synchronized",
        actorId: asId(input.actor._id),
        ...(input.actor.email ? { actorEmail: input.actor.email } : {}),
        actorRole: actorRole(input.actor),
        targetCollection: "Student",
        targetId: result.studentId,
        details: { borrowerNumber, userId: result.userId, userSynchronized: result.userSynchronized, alreadyAssigned: result.alreadyAssigned, ...(input.details || {}) },
      });
    }
    return result;
  } finally {
    await session.endSession();
  }
};
