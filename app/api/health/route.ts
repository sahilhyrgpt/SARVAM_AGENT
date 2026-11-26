import { getSarvamClient } from "@/lib/sarvam/client";
import { getMongoUri } from "@/lib/storage/mongodb";
import { successResponse } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET() {
  const sarvamClient = getSarvamClient();
  const sarvamConfigured = sarvamClient.isConfigured();
  const mongoUri = getMongoUri();

  return successResponse({
    status: "healthy",
    timestamp: new Date().toISOString(),
    sarvamConfigured,
    databaseConfigured: !!mongoUri,
    version: "1.0.0",
  });
}
