import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { mapSarvamCallStatus } from "@/lib/sarvam/mapper";
import { sendBackendStatusUpdate } from "@/lib/backend/client";
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

  const interviewId = (body.interviewId as string) || (body.callId as string);
  let resumeDataId = (body.resumeDataId as string) || "";
  const rawStatus = (body.status as string) || "NO_ANSWER";
  const status = rawStatus.toUpperCase().replace(/[- ]/g, "_");

  const repository = getInterviewRepository();

  // If interviewId is provided, retrieve candidate ID and update local status
  if (interviewId) {
    try {
      const interview = await repository.getInterview(interviewId);
      if (interview) {
        if (!resumeDataId) {
          resumeDataId = interview.candidate.id;
        }
        const mappedStatus = mapSarvamCallStatus(rawStatus);
        await repository.updateCallStatus(interviewId, mappedStatus, {
          failureReason: rawStatus,
        });
      }
    } catch (dbErr) {
      logger.error("[update-status] Error updating local interview status", {
        interviewId,
        error: dbErr instanceof Error ? dbErr.message : dbErr,
      });
    }
  }

  if (!resumeDataId) {
    return errorResponse(
      "VALIDATION_ERROR",
      "resumeDataId or a valid interviewId is required to update telephonic status.",
      422
    );
  }

  try {
    const backendRes = await sendBackendStatusUpdate({
      resumeDataId,
      status,
      interviewId,
    });

    if (!backendRes.success) {
      return errorResponse(
        "BACKEND_UPDATE_FAILED",
        backendRes.error || "Failed to update status on backend.",
        backendRes.statusCode || 502,
        backendRes.data
      );
    }

    return successResponse({
      updated: true,
      resumeDataId,
      status,
      backendResponse: backendRes.data,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[update-status] Unhandled exception in update-status route", {
      resumeDataId,
      status,
      error: errorMsg,
    });
    return errorResponse("SERVER_ERROR", errorMsg, 500);
  }
}
