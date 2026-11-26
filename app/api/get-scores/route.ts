import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { requireApiKeyOrSession } from "@/lib/security/api-guard";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { generateInterviewEvaluation } from "@/lib/openai/evaluator";
import { getSarvamClient } from "@/lib/sarvam/client";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyOrSession(req);
  if (!auth.authenticated) {
    return errorResponse("UNAUTHORIZED", auth.error || "Authentication required.", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Invalid JSON payload in request body.", 400);
  }

  const interviewId = typeof body.interviewId === "string" ? body.interviewId.trim() : "";
  const repository = getInterviewRepository();

  // Mode 1: Using an existing Interview ID stored in DB
  if (interviewId) {
    let interview = await repository.getInterview(interviewId);
    if (!interview) {
      return errorResponse("NOT_FOUND", `Interview with ID '${interviewId}' was not found.`, 404);
    }

    // If transcript is currently empty, attempt automatic sync with Sarvam
    if (!interview.transcript || interview.transcript.length === 0) {
      const lookupKey = interview.call.interactionId || interview.call.providerCallId;
      if (lookupKey) {
        try {
          const sarvamClient = getSarvamClient();
          const syncRes = await sarvamClient.fetchCallAnalytics(lookupKey, interview.id);
          if (syncRes.transcript && syncRes.transcript.length > 0) {
            await repository.saveTranscript(interview.id, syncRes.transcript);
            interview = (await repository.getInterview(interview.id)) || interview;
          }
        } catch (syncErr) {
          logger.warn("Auto-sync prior to scoring encountered an error", { syncErr });
        }
      }
    }

    if (!interview.transcript || interview.transcript.length === 0) {
      return errorResponse(
        "TRANSCRIPT_EMPTY",
        "The call does not have any recorded transcript entries yet. Please ensure the call was completed and synced from Sarvam.",
        400
      );
    }

    try {
      const evaluation = await generateInterviewEvaluation({
        companyName: interview.company_name || interview.job.company_name,
        jobTitle: interview.job.title,
        jobDescription: interview.job.description,
        transcript: interview.transcript,
        skills: interview.skills || interview.job.skills,
      });

      // Save evaluation and update status to score_generated in database
      await repository.updateInterview(interview.id, { evaluation });
      await repository.updateCallStatus(interview.id, "score_generated");

      const updated = await repository.getInterview(interview.id);

      return successResponse({
        interviewId: interview.id,
        status: "score_generated",
        score: evaluation.score,
        evaluation,
        interview: updated,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to generate evaluation scores.";
      logger.error("Error generating score for interview", { interviewId, error: errMsg });
      return errorResponse("EVALUATION_FAILED", errMsg, 500);
    }
  }

  // Mode 2: Direct payload with jobTitle, jobDescription, and transcript
  const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle.trim() : "";
  const jobDescription = typeof body.jobDescription === "string" ? body.jobDescription.trim() : "";
  const transcript = body.transcript as unknown;

  if (!jobTitle || !transcript) {
    return errorResponse(
      "MISSING_FIELDS",
      "Either 'interviewId' or 'jobTitle' with 'transcript' must be provided in request body.",
      422
    );
  }

  try {
    const evaluation = await generateInterviewEvaluation({
      jobTitle,
      jobDescription,
      transcript: transcript as Parameters<typeof generateInterviewEvaluation>[0]["transcript"],
      skills: Array.isArray(body.skills) ? (body.skills as string[]) : undefined,
    });

    return successResponse({
      score: evaluation.score,
      evaluation,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Failed to generate evaluation scores.";
    return errorResponse("EVALUATION_FAILED", errMsg, 500);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireApiKeyOrSession(req);
  if (!auth.authenticated) {
    return errorResponse("UNAUTHORIZED", auth.error || "Authentication required.", 401);
  }

  const { searchParams } = new URL(req.url);
  const interviewId = searchParams.get("interviewId")?.trim();
  const force = searchParams.get("force") === "true";

  if (!interviewId) {
    return errorResponse("MISSING_PARAM", "'interviewId' query parameter is required.", 400);
  }

  const repository = getInterviewRepository();
  const interview = await repository.getInterview(interviewId);

  if (!interview) {
    return errorResponse("NOT_FOUND", `Interview with ID '${interviewId}' was not found.`, 404);
  }

  // If already evaluated and not forced, return cached evaluation
  if (interview.evaluation && !force) {
    return successResponse({
      interviewId,
      status: interview.call.status,
      evaluation: interview.evaluation,
    });
  }

  // Otherwise trigger generation
  if (!interview.transcript || interview.transcript.length === 0) {
    return errorResponse(
      "TRANSCRIPT_EMPTY",
      "The call does not have any recorded transcript entries yet.",
      400
    );
  }

  try {
    const evaluation = await generateInterviewEvaluation({
      companyName: interview.company_name || interview.job.company_name,
      jobTitle: interview.job.title,
      jobDescription: interview.job.description,
      transcript: interview.transcript,
      skills: interview.skills || interview.job.skills,
    });

    await repository.updateInterview(interview.id, { evaluation });
    await repository.updateCallStatus(interview.id, "score_generated");

    const updated = await repository.getInterview(interview.id);

    return successResponse({
      interviewId: interview.id,
      status: "score_generated",
      score: evaluation.score,
      evaluation,
      interview: updated,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Failed to generate evaluation scores.";
    return errorResponse("EVALUATION_FAILED", errMsg, 500);
  }
}
