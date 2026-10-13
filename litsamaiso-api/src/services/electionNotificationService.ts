import React from "react";
import { render } from "@react-email/render";
import { Types } from "mongoose";
import { Election, type ElectionDocument } from "../models/Election.js";
import {
  ElectionNotification,
  type ElectionNotificationFailure,
  type ElectionNotificationKind,
} from "../models/ElectionNotification.js";
import { Candidate } from "../models/Candidate.js";
import { Position } from "../models/Position.js";
import { ResultSnapshot } from "../models/ResultSnapshot.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { VoterRecord } from "../models/VoterRecord.js";
import ElectionEmail, {
  electionEmailSubject,
  electionEmailText,
  type ElectionEmailProps,
  type ElectionResultLine,
} from "../emailTemplates/ElectionEmail.js";
import { getEmailBranding } from "../utils/email.js";
import { emailLooksValid, sendBulk } from "../utils/bulkEmail.js";
import { recordAudit } from "../utils/auditLog.js";

// Emails active registry students as an election opens, nears its close, closes and publishes
// results. Each email is sent at most once per election (see ElectionNotification) and runs in
// a background job, so it survives restarts and resumes where it stopped.

// Keep the stored failure list small; counts stay exact
const MAX_STORED_FAILURES = 200;

type Recipient = { studentId: string; email: string };

const clientBaseUrl = () =>
  (process.env.CLIENT_BASE_URL || process.env.PASSWORD_RESET_BASE_URL || "").replace(/\/$/, "");

const link = (path: string) => {
  const base = clientBaseUrl();
  return base ? `${base}${path}` : "";
};

// "7 Oct 2026, 18:00 GMT+2", in the election's timezone when it is valid
const formatInZone = (date: Date | undefined, timeZone: string | undefined) => {
  if (!date) return "";
  // dateStyle/timeStyle can't be combined with timeZoneName, so spell the fields out
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: timeZone || "UTC" }).format(date);
  } catch {
    // Unknown timezone name on the election
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(date);
  }
};

const formatTimeLeft = (ms: number) => {
  const hours = Math.max(1, Math.round(ms / (60 * 60 * 1000)));
  return `${hours} hour${hours === 1 ? "" : "s"}`;
};

// Active students in the election's institution, one per email address, in a stable order so
// an interrupted send can resume by position
const resolveRecipients = async (election: ElectionDocument & { _id: Types.ObjectId }): Promise<Recipient[]> => {
  const students = await Student.find({ institution: election.institution, studentStatus: true })
    .select("studentId email")
    .sort({ studentId: 1 })
    .lean();

  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  for (const student of students) {
    const email = String(student.email || "").trim().toLowerCase();
    if (!email || !emailLooksValid(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ studentId: student.studentId, email });
  }
  return recipients;
};

// Who voted (never how): used to personalise the close email and to skip voters for the reminder
const loadVoterIds = async (electionId: Types.ObjectId) =>
  new Set(
    (await VoterRecord.find({ electionId }).select("studentId").lean()).map((record) => record.studentId),
  );

const loadAccountIds = async (studentIds: string[]) =>
  new Set(
    (await User.find({ studentId: { $in: studentIds } }).select("studentId").lean()).map((user) =>
      String(user.studentId),
    ),
  );

const loadResultLines = async (electionId: Types.ObjectId): Promise<ElectionResultLine[]> => {
  const snapshot = await ResultSnapshot.findOne({ electionId }).sort({ generatedAt: -1 }).lean();
  if (!snapshot) return [];

  const [positions, candidates] = await Promise.all([
    Position.find({ _id: { $in: snapshot.positions.map((p) => p.positionId) } })
      .select("title displayOrder")
      .lean(),
    Candidate.find({ electionId }).select("fullName").lean(),
  ]);
  const positionById = new Map(positions.map((p) => [p._id.toString(), p]));
  const nameById = new Map(candidates.map((c) => [c._id.toString(), c.fullName]));

  return snapshot.positions
    .filter((p) => p.rankings.length > 0) // positions with no candidates weren't on the ballot
    .map((p) => {
      const topVotes = p.rankings[0]?.votes || 0;
      const outcome = p.outcome || (p.winnerId ? "WINNER" : topVotes === 0 ? "NO_VOTES" : "TIE");
      const leaders = p.rankings.filter((r) => r.votes === topVotes && topVotes > 0);
      const names =
        outcome === "WINNER" && p.winnerId
          ? [nameById.get(p.winnerId.toString()) || "Candidate"]
          : leaders.map((r) => nameById.get(r.candidateId.toString()) || "Candidate");
      const position = positionById.get(p.positionId.toString());
      return {
        position: position?.title || "Position",
        order: position?.displayOrder ?? 0,
        outcome,
        names,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...line }) => line);
};

// Why an email should no longer go out, or null if it should
const skipReason = (election: ElectionDocument | null, kind: ElectionNotificationKind): string | null => {
  if (!election || election.deletedAt) return "Election was deleted";
  if (!election.notifyStudents) return "Student emails are turned off for this election";
  if (kind === "OPENED" && !["OPEN", "CLOSED", "COUNTING", "RESULTS_PUBLISHED"].includes(election.status)) {
    return "Election never opened";
  }
  if (kind === "REMINDER" && election.status !== "OPEN") return "Election is no longer open";
  if (kind === "RESULTS" && !election.resultsPublished) return "Results are not published";
  return null;
};

// Creates the record and queues the send. A second call for the same election and email is a no-op.
export const queueElectionNotification = async (
  electionId: string | Types.ObjectId,
  kind: ElectionNotificationKind,
): Promise<void> => {
  try {
    await ElectionNotification.create({ electionId, kind, status: "queued" });
  } catch (error: any) {
    if (error?.code === 11000) return; // already queued or sent
    throw error;
  }
  const { getAgenda } = await import("../scheduler/agenda.js");
  await getAgenda().now("election.notify", { electionId: String(electionId), kind });
};

// Queue a notification without letting an email problem break the election action that triggered it
export const queueElectionNotificationSafely = async (
  electionId: string | Types.ObjectId,
  kind: ElectionNotificationKind,
): Promise<void> => {
  try {
    await queueElectionNotification(electionId, kind);
  } catch (error) {
    console.error(`[election-email] could not queue ${kind} for election ${String(electionId)}`, error);
  }
};

export const processElectionNotification = async (
  electionId: string,
  kind: ElectionNotificationKind,
  options: { keepAlive?: () => Promise<unknown> } = {},
): Promise<void> => {
  const notification = await ElectionNotification.findOne({ electionId, kind });
  // Reminders are scheduled ahead of time and get their record when they fire
  if (!notification && kind !== "REMINDER") return;
  if (notification && ["completed", "skipped"].includes(notification.status)) return;

  const record =
    notification ||
    (await ElectionNotification.findOneAndUpdate(
      { electionId, kind },
      { $setOnInsert: { status: "queued" } },
      { upsert: true, returnDocument: "after" },
    ));
  if (!record || ["completed", "skipped"].includes(record.status)) return;

  const election = await Election.findById(electionId);
  const reason = skipReason(election, kind);
  if (reason || !election) {
    await ElectionNotification.updateOne(
      { _id: record._id },
      { status: "skipped", skippedReason: reason || "Election not found", completedAt: new Date() },
    );
    return;
  }

  try {
    const allRecipients = await resolveRecipients(election);
    const voterIds = kind === "REMINDER" || kind === "CLOSED" ? await loadVoterIds(election._id) : new Set<string>();
    const recipients = kind === "REMINDER" ? allRecipients.filter((r) => !voterIds.has(r.studentId)) : allRecipients;
    const accountIds =
      kind === "OPENED" || kind === "REMINDER" ? await loadAccountIds(recipients.map((r) => r.studentId)) : new Set<string>();
    const results = kind === "RESULTS" ? await loadResultLines(election._id) : [];

    // Resume after a restart or a failed attempt instead of emailing earlier recipients again
    const start = ["processing", "failed"].includes(record.status) ? record.processedCount : 0;
    const previousSent = start ? record.successfulSends : 0;
    const previousFailures = start ? record.failures : [];
    const previousFailedCount = start ? record.failedSends : 0;

    await ElectionNotification.updateOne(
      { _id: record._id },
      {
        status: "processing",
        totalRecipients: recipients.length,
        ...(start === 0 && { startedAt: new Date(), processedCount: 0, successfulSends: 0, failedSends: 0, failures: [] }),
      },
    );

    const branding = getEmailBranding();
    const closesAt = formatInZone(election.endTime, election.timezone);
    const timeLeft = election.endTime ? formatTimeLeft(election.endTime.getTime() - Date.now()) : "";
    const voteUrl = link(`/elections/${election._id.toString()}/vote`);
    const registerUrl = link("/register");

    const propsFor = (recipient: Recipient): ElectionEmailProps => {
      const brand = { appName: branding.appName, logoUrl: branding.logoUrl, accentColor: branding.accentColor };
      const hasAccount = accountIds.has(recipient.studentId);
      switch (kind) {
        case "OPENED":
          return { ...brand, variant: "opened", electionTitle: election.title, closesAt, hasAccount, studentId: recipient.studentId, ctaUrl: hasAccount ? voteUrl : registerUrl };
        case "REMINDER":
          return { ...brand, variant: "reminder", electionTitle: election.title, closesAt, timeLeft, hasAccount, studentId: recipient.studentId, ctaUrl: hasAccount ? voteUrl : registerUrl };
        case "CLOSED":
          return { ...brand, variant: voterIds.has(recipient.studentId) ? "closed-voted" : "closed-not-voted", electionTitle: election.title };
        case "RESULTS":
          return { ...brand, variant: "results", electionTitle: election.title, results, ctaUrl: link("/elections") };
      }
    };

    // Most recipients share one of a few versions of each email, so render those once. The
    // version for students without an account names their student ID, so it isn't shared.
    const renderCache = new Map<string, string>();
    const sharedKey = (props: ElectionEmailProps): string | null =>
      props.variant === "opened" || props.variant === "reminder"
        ? props.hasAccount
          ? `${props.variant}:account`
          : null
        : props.variant;

    const progress = await sendBulk(
      recipients.slice(start),
      async (recipient) => {
        const props = propsFor(recipient);
        const key = sharedKey(props);
        let html = key ? renderCache.get(key) : undefined;
        if (!html) {
          html = await Promise.resolve(render(React.createElement(ElectionEmail, props)));
          if (key) renderCache.set(key, html);
        }
        return {
          to: recipient.email,
          subject: electionEmailSubject(props),
          text: electionEmailText(props),
          html,
          attachments: branding.attachments,
        };
      },
      async ({ processed, sent, failures }) => {
        await ElectionNotification.updateOne(
          { _id: record._id },
          {
            processedCount: start + processed,
            successfulSends: previousSent + sent,
            failedSends: previousFailedCount + failures.length,
            failures: [...previousFailures, ...failures].slice(0, MAX_STORED_FAILURES) as ElectionNotificationFailure[],
          },
        );
        // Long sends keep the job's lock alive so it isn't picked up again mid-send
        if (options.keepAlive) await options.keepAlive();
      },
    );

    await ElectionNotification.updateOne(
      { _id: record._id },
      {
        status: "completed",
        processedCount: recipients.length,
        successfulSends: previousSent + progress.sent,
        failedSends: previousFailedCount + progress.failures.length,
        completedAt: new Date(),
      },
    );

    await recordAudit({
      action: "election.notify",
      targetCollection: "Election",
      targetId: election._id.toString(),
      details: {
        kind,
        recipients: recipients.length,
        sent: previousSent + progress.sent,
        failed: previousFailedCount + progress.failures.length,
      },
    });
  } catch (error: any) {
    await ElectionNotification.updateOne(
      { _id: record._id },
      { status: "failed", lastError: error?.message || String(error), completedAt: new Date() },
    );
    console.error(`[election-email] ${kind} failed for election ${electionId}`, error);
  }
};
