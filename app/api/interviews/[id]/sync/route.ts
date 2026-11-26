import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { getSarvamClient } from "@/lib/sarvam/client";
import { cleanSarvamId } from "@/lib/sarvam/mapper";
import { requireApiKeyOrSession } from "@/lib/security/api-guard";
import { runPostCallProcessing } from "@/lib/processing/post-call";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { logger } from "@/lib/utils/logger";
import { CallStatus } from "@/types/interview";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiKeyOrSession(req);
  if (!auth.authenticated) {
    return errorResponse("UNAUTHORIZED", auth.error || "Authentication required.", 401);
  }

  const { id } = await context.params;
  if (!id) {
    return errorResponse("INVALID_ID", "Interview ID is required.", 400);
  }

  const repository = getInterviewRepository();
  const interview = await repository.getInterview(id);

  if (!interview) {
    return errorResponse("NOT_FOUND", `Interview with ID '${id}' was not found.`, 404);
  }

  const providerCallId = cleanSarvamId(interview.call.providerCallId);
  const interactionId = cleanSarvamId(interview.call.interactionId);
  const lookupKey = interactionId || providerCallId || id;

  const sarvamClient = getSarvamClient();
  const syncResult = await sarvamClient.fetchCallAnalytics(lookupKey, id);

  if (!syncResult.success) {
    return errorResponse(
      "SYNC_FAILED",
      syncResult.error || "Failed to fetch call analytics from Sarvam AI.",
      502,
      syncResult.rawDetails
    );
  }

  // Update status, duration, and recording URL in MongoDB
  if (syncResult.status && syncResult.status !== "unknown") {
    await repository.updateCallStatus(id, syncResult.status as CallStatus, {
      duration: syncResult.duration !== undefined ? syncResult.duration : interview.call.duration,
      providerCallId: syncResult.attemptId || providerCallId,
      interactionId: cleanSarvamId(syncResult.interactionId) || cleanSarvamId(interview.call.interactionId),
      recordingUrl: syncResult.recordingUrl || `/api/interviews/${id}/recording`,
    });
  }

  // Save transcripts if retrieved
  if (syncResult.transcript && syncResult.transcript.length > 0) {
    await repository.saveTranscript(id, syncResult.transcript);
  }

  // Save agent variables into outputVariables if present
  if (syncResult.agentVariables && Object.keys(syncResult.agentVariables).length > 0) {
    await repository.updateInterview(id, {
      outputVariables: {
        ...(interview.outputVariables || {}),
        ...syncResult.agentVariables,
      },
    });
  }

  // If call completed, trigger the full post-call processing pipeline
  // (transcript fetch, Q&A mapping, AI scoring — all in series)
  const latestInterview = await repository.getInterview(id);
  if (
    latestInterview &&
    ["completed", "score_generated"].includes(latestInterview.call.status) &&
    !latestInterview.evaluation
  ) {
    // Fire-and-forget so sync response is returned quickly
    runPostCallProcessing(id).catch((err) => {
      logger.warn("Post-call processing triggered from sync failed (non-fatal)", {
        interviewId: id,
        error: err instanceof Error ? err.message : err,
      });
    });
  }

  const updated = await repository.getInterview(id);

  return successResponse({
    synced: true,
    interview: updated,
    sarvamResponse: syncResult,
  });
}
