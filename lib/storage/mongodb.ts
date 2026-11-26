import { MongoClient, Db } from "mongodb";
import { logger } from "@/lib/utils/logger";
import { ensureEnvLoaded } from "@/lib/utils/env";

/**
 * Global MongoDB Connection Singleton
 *
 * Establishes a persistent connection pool upon first request and reuses
 * the shared client across all Next.js API route invocations, avoiding
 * reconnect overhead, unhandled rejections at build time, and connection exhaustion.
 */

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

/**
 * Connection string (URI) only. MONGO_DB is the database NAME, not a URI,
 * so it must never be read here.
 */
export function getMongoUri(): string {
  ensureEnvLoaded();
  return process.env.MONGODB_URI || process.env.DATABASE_URL || "";
}

/**
 * Database name from env (default: ai_calling_agent).
 */
export function getMongoDbName(): string {
  ensureEnvLoaded();
  return process.env.MONGO_DB || "ai_calling_agent";
}

let clientPromise: Promise<MongoClient> | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error(
      "MONGODB_URI (or DATABASE_URL) environment variable is not configured."
    );
  }

  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    throw new Error(
      "Invalid MongoDB URI: it must start with mongodb:// or mongodb+srv://. " +
        "Check for quotes, spaces, or a wrong variable in .env.local."
    );
  }

  // Preserve connection pool across HMR in development
  if (process.env.NODE_ENV === "development" && globalThis._mongoClientPromise) {
    return globalThis._mongoClientPromise;
  }

  if (!clientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 20,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 8000,
    });

    clientPromise = client
      .connect()
      .then((c) => {
        logger.info("MongoDB connection successfully established");
        return c;
      })
      .catch((err) => {
        clientPromise = null; // reset so next request can retry
        if (process.env.NODE_ENV === "development") {
          globalThis._mongoClientPromise = undefined;
        }
        logger.error("Failed to connect to MongoDB", { error: err.message });
        throw err;
      });

    if (process.env.NODE_ENV === "development") {
      globalThis._mongoClientPromise = clientPromise;
    }
  }

  return clientPromise;
}

export async function getDb(dbName?: string): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName ?? getMongoDbName());
}