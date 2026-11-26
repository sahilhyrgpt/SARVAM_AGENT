import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { sendBackendInterviewData, SubmitTelephonicDataPayload } from "@/lib/backend/client";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Invalid JSON payload in request body.", 400);
  }

  let resumeDataId = (body.resumeDataId as string) || "";
  const callId = (body.callId as string) || (body.interviewId as string) || "";

  const repository = getInterviewRepository();

  // If resumeDataId is not provided but callId is, lookup candidate id
  if (!resumeDataId && callId) {
    try {
      const interview = await repository.getInterview(callId);
      if (interview) {
        resumeDataId = interview.candidate.id;
      }
    } catch (dbErr) {
      logger.error("[update-data] Error querying interview for resumeDataId", {
        callId,
        error: dbErr instanceof Error ? dbErr.message : dbErr,
      });
    }
  }

  if (!resumeDataId) {
    return errorResponse(
      "VALIDATION_ERROR",
      "resumeDataId or a valid callId is required to submit telephonic interview data.",
      422
    );
  }

  const payload: SubmitTelephonicDataPayload = {
    resumeDataId,
    callId,
    callData: (body.callData as Record<string, unknown>) || {},
    sarvamData: (body.sarvamData as Record<string, unknown>) || {},
    interviewConversation: Array.isArray(body.interviewConversation)
      ? (body.interviewConversation as SubmitTelephonicDataPayload["interviewConversation"])
      : [],
    score: typeof body.score === "number" ? body.score : 0,
    scoreData: (body.scoreData as Record<string, unknown>) || null,
    status: (body.status as string) || "completed",
  };

  try {
    const backendRes = await sendBackendInterviewData(payload);

    if (!backendRes.success) {
      return errorResponse(
        "BACKEND_SUBMIT_FAILED",
        backendRes.error || "Failed to submit interview data to backend.",
        backendRes.statusCode || 502,
        backendRes.data
      );
    }

    return successResponse({
      submitted: true,
      resumeDataId,
      callId,
      backendResponse: backendRes.data,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[update-data] Unhandled exception submitting interview data to backend", {
      resumeDataId,
      callId,
      error: errorMsg,
    });
    return errorResponse("SERVER_ERROR", errorMsg, 500);
  }
}
