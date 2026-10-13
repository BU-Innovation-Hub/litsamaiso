import { sendEmail } from "./email.js";

// Throttled bulk sending shared by administrative and election emails. Sends in batches with
// a little concurrency, retries each message once, and pauses between batches so SMTP
// providers' rate limits aren't hit.

const readInt = (value: string | undefined, fallback: number, min: number) =>
  Math.max(min, Number.parseInt(value || String(fallback), 10) || fallback);

const BATCH_SIZE = readInt(process.env.ADMIN_EMAIL_BATCH_SIZE, 25, 1);
const CONCURRENCY = readInt(process.env.ADMIN_EMAIL_CONCURRENCY, 3, 1);
const BATCH_DELAY_MS = readInt(process.env.ADMIN_EMAIL_BATCH_DELAY_MS, 500, 0);

export type BulkMessage = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: any[] | undefined;
};

export type BulkFailure = { email: string; error: string };

export type BulkProgress = {
  // Items handled so far in this call, sent or failed
  processed: number;
  sent: number;
  failures: BulkFailure[];
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const emailLooksValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const sendWithRetry = async (message: BulkMessage): Promise<BulkFailure | null> => {
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await sendEmail(message);
      return null;
    } catch (error: any) {
      lastError = error?.message || String(error);
      if (attempt < 2) await sleep(500);
    }
  }
  return { email: message.to, error: lastError || "Email send failed" };
};

// Sends one message per item. `onBatch` runs after every batch so callers can persist progress.
export const sendBulk = async <T>(
  items: T[],
  build: (item: T) => BulkMessage | Promise<BulkMessage>,
  onBatch?: (progress: BulkProgress) => Promise<void>,
): Promise<BulkProgress> => {
  const progress: BulkProgress = { processed: 0, sent: 0, failures: [] };

  for (let batchStart = 0; batchStart < items.length; batchStart += BATCH_SIZE) {
    const batch = items.slice(batchStart, batchStart + BATCH_SIZE);

    for (let start = 0; start < batch.length; start += CONCURRENCY) {
      const group = batch.slice(start, start + CONCURRENCY);
      const results = await Promise.all(group.map(async (item) => sendWithRetry(await build(item))));
      for (const failure of results) {
        if (failure) progress.failures.push(failure);
        else progress.sent += 1;
      }
      progress.processed += group.length;
    }

    if (onBatch) await onBatch(progress);

    if (batchStart + BATCH_SIZE < items.length && BATCH_DELAY_MS > 0) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return progress;
};
