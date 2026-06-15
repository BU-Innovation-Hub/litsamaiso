import { Agenda, type Job } from "agenda";

import { getMongoUri } from "../config/database.js";

let agenda: Agenda | null = null;
// Function to initialize the Agenda instance with MongoDB connection and define scheduled jobs for election management
export const initAgenda = async (): Promise<Agenda> => {
  if (agenda) return agenda;

  const mongoUri = getMongoUri();
  // Initialize Agenda with MongoDB connection details and specify the collection for storing job data
  agenda = new Agenda({
    db: {
      address: mongoUri,
      collection: process.env.AGENDA_COLLECTION || "agendaJobs",
    },
    processEvery: "5 seconds",
  });
  // Define a job for opening an election, which will be triggered by the scheduler
  agenda.define("election.open", async (job: Job) => {
    const electionId = String(job.attrs.data?.electionId || "");
    if (!electionId) return;
    const service = await import("../services/electionService.js");
    await service.openElectionByJob(electionId);
  });
  // Define a job for closing an election, which will be triggered by the scheduler
  agenda.define("election.close", async (job: Job) => {
    const electionId = String(job.attrs.data?.electionId || "");
    if (!electionId) return;
    const service = await import("../services/electionService.js");
    await service.closeElectionByJob(electionId);
  });
  // Define a job for counting election results, which will be triggered by the scheduler
  agenda.define("election.count", async (job: Job) => {
    const electionId = String(job.attrs.data?.electionId || "");
    if (!electionId) return;
    const service = await import("../services/resultService.js");
    await service.computeElectionResults(electionId, { source: "job" });
  });

  await agenda.start();

  return agenda;
};
// Function to retrieve the initialized Agenda instance, throwing an error if it has not been initialized yet
export const getAgenda = (): Agenda => {
  if (!agenda) {
    throw new Error("Agenda has not been initialized");
  }
  return agenda;
};
