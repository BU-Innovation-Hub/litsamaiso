import { getAgenda } from "../scheduler/agenda.js";
/* Service functions for scheduling election-related jobs using the Agenda library,
 including opening and closing elections and counting results based on election
 timelines. These functions interact with the Agenda instance to manage scheduled
  tasks for election events.*/
const ELECTION_JOB_NAMES = ["election.open", "election.close", "election.count"];

// The reminder email goes out 6 hours before close; elections shorter than 12 hours don't get one
const REMINDER_LEAD_MS = 6 * 60 * 60 * 1000;
const MIN_WINDOW_FOR_REMINDER_MS = 12 * 60 * 60 * 1000;

const cancelReminderJob = async (electionId: string): Promise<void> => {
  await getAgenda().cancel({ name: "election.notify", "data.electionId": electionId, "data.kind": "REMINDER" });
};

// Cancels pending open/close/count jobs and the reminder email. Other queued emails are left to run.
export const cancelElectionJobs = async (electionId: string): Promise<void> => {
  const agenda = getAgenda();
  await agenda.cancel({
    name: { $in: ELECTION_JOB_NAMES },
    "data.electionId": electionId,
  });
  await cancelReminderJob(electionId);
};

// Schedules the "time is running out" email 6 hours before close, for windows of 12 hours or more
export const scheduleReminderJob = async (params: {
  electionId: string;
  startTime: Date;
  endTime: Date;
}): Promise<void> => {
  await cancelReminderJob(params.electionId);
  const window = params.endTime.getTime() - params.startTime.getTime();
  const remindAt = new Date(params.endTime.getTime() - REMINDER_LEAD_MS);
  if (window < MIN_WINDOW_FOR_REMINDER_MS || remindAt <= new Date()) return;
  await getAgenda().schedule(remindAt, "election.notify", { electionId: params.electionId, kind: "REMINDER" });
};

export const scheduleElectionJobs = async (params: {
  electionId: string;
  startTime: Date;
  endTime: Date;
}): Promise<void> => {
  const agenda = getAgenda();
  const { electionId, startTime, endTime } = params;

  await cancelElectionJobs(electionId);

  await agenda.schedule(startTime, "election.open", { electionId });
  await agenda.schedule(endTime, "election.close", { electionId });
  await scheduleReminderJob({ electionId, startTime, endTime });
};

// Replace the pending close job when an open election's end time changes
export const rescheduleCloseJob = async (electionId: string, endTime: Date): Promise<void> => {
  const agenda = getAgenda();
  await agenda.cancel({ name: "election.close", "data.electionId": electionId });
  await agenda.schedule(endTime, "election.close", { electionId });
};

export const scheduleCountJob = async (electionId: string): Promise<void> => {
  const agenda = getAgenda();
  await agenda.now("election.count", { electionId });
};
