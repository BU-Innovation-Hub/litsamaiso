import { getAgenda } from "../scheduler/agenda.js";
/* Service functions for scheduling election-related jobs using the Agenda library,
 including opening and closing elections and counting results based on election
 timelines. These functions interact with the Agenda instance to manage scheduled
  tasks for election events.*/
const ELECTION_JOB_NAMES = ["election.open", "election.close", "election.count"];

export const cancelElectionJobs = async (electionId: string): Promise<void> => {
  const agenda = getAgenda();
  await agenda.cancel({
    name: { $in: ELECTION_JOB_NAMES },
    "data.electionId": electionId,
  });
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
