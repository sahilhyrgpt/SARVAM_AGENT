import { InterviewRepository } from "./interface";
import { MemoryInterviewRepository } from "./memory-repository";
import { MongoInterviewRepository } from "./mongo-repository";
import { getMongoUri } from "./mongodb";
import { logger } from "@/lib/utils/logger";

/**
 * Storage Layer Factory
 *
 * Automatically connects to MongoDB when MONGO_DB, MONGODB_URI, or DATABASE_URL is present.
 * Uses a persistent connection pool established upon first access.
 * Falls back to in-memory repository when no database URI is provided.
 */
let repositoryInstance: InterviewRepository | null = null;

export function getInterviewRepository(): InterviewRepository {
  if (!repositoryInstance) {
    const mongoUri = getMongoUri();
    if (mongoUri) {
      logger.info("Initializing MongoDB Interview Repository with persistent connection pool");
      repositoryInstance = new MongoInterviewRepository();
    } else {
      logger.info("Initializing In-Memory Interview Repository");
      repositoryInstance = new MemoryInterviewRepository();
    }
  }
  return repositoryInstance;
}

export * from "./interface";
export * from "./memory-repository";
export * from "./mongo-repository";
export * from "./mongodb";
