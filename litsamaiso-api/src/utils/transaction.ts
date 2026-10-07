import mongoose, { type ClientSession } from "mongoose";

let transactionsSupported: Promise<boolean> | null = null;

// Transactions need a replica set or sharded cluster (Atlas always is); a standalone
// local mongod is not. Checked once per process.
export const supportsTransactions = (): Promise<boolean> => {
  if (!transactionsSupported) {
    transactionsSupported = (async () => {
      const db = mongoose.connection.db;
      if (!db) return false;
      const hello = await db.admin().command({ hello: 1 });
      return Boolean(hello.setName) || hello.msg === "isdbgrid";
    })().catch(() => false);
  }
  return transactionsSupported;
};

// Runs `fn` inside a transaction when the server supports one, otherwise without a session.
// Callers must make the no-session path safe themselves (e.g. undo partial writes).
export const withOptionalTransaction = async <T>(
  fn: (session: ClientSession | null) => Promise<T>,
): Promise<T> => {
  if (!(await supportsTransactions())) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};
