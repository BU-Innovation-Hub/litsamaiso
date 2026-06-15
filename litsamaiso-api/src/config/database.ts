import mongoose from "mongoose";

export const getMongoUri = (): string => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI or MONGODB_URI is not set");
  }

  return mongoUri;
};

export const connectDatabase = async (): Promise<void> => {
  const mongoUri = getMongoUri();

  try {
    await mongoose.connect(mongoUri);
  } catch (error) {
    if (mongoUri.startsWith("mongodb+srv://")) {
      throw new Error(
        `Failed to connect to MongoDB Atlas via SRV. Check DNS/network access, Atlas IP allowlist, or switch to a standard mongodb:// connection string. Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    throw error;
  }
};
