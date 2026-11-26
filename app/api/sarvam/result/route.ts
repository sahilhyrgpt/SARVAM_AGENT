import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { validateSarvamWebhook } from "@/lib/sarvam/security";
import { requireSarvamContextSecret, requireApiKeyOrSession } from "@/lib/security/api-guard";
import { mapSarvamCallStatus, normalizeSarvamResult, cleanSarvamId } from "@/lib/sarvam/mapper";
import { getSarvamClient } from "@/lib/sarvam/client";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { logger } from "@/lib/utils/logger";
import { CallStatus } from "@/types/interview";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    // Empty body is acceptable if params are in searchParams
  }

  // 1. Multi-tier Authentication Support
  const webhookCheck = validateSarvamWebhook(rawBody, req.headers);
  const contextCheck = requireSarvamContextSecret(req);
  const apiCheck = await requireApiKeyOrSession(req);

  if (!webhookCheck.valid && !contextCheck.authenticated && !apiCheck.authenticated) {
    logger.warn("Sarvam Result endpoint unauthorized", {
      webhookReason: webhookCheck.reason,
    });
    return errorResponse("UNAUTHORIZED", "Valid context secret, webhook secret, or API key is required.", 401);
  }

  const { searchParams } = new URL(req.url);
  let parsedBody: Record<string, unknown> = {};

  if (rawBody && rawBody.trim().length > 0) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      try {
        const formData = new URLSearchParams(rawBody);
        formData.forEach((value, key) => {
          parsedBody[key] = value;
        });
      } catch {
        // ignore parse error
      }
    }
  }

  // Auto-parse fields that Sarvam tool may send as JSON strings instead of objects
  for (const key of ["answers", "answers_json", "transcript", "transcript_json", "output_variables", "metadata", "agent_variables", "final_agent_variables"]) {
    const val = parsedBody[key];
    if (typeof val === "string" && (val.trim().startsWith("[") || val.trim().startsWith("{"))) {
      try {
        parsedBody[key] = JSON.parse(val);
      } catch {
        // leave as-is if not valid JSON
      }
    }
  }

  if (parsedBody.answers_json && !parsedBody.answers) {
    parsedBody.answers = parsedBody.answers_json;
  }
  if (parsedBody.transcript_json && !parsedBody.transcript) {
    parsedBody.transcript = parsedBody.transcript_json;
  }
  if (parsedBody.interview_duration_seconds && !parsedBody.duration) {
    parsedBody.duration = Number(parsedBody.interview_duration_seconds) || undefined;
  }
  if (parsedBody.interview_status && !parsedBody.status) {
    parsedBody.status = parsedBody.interview_status;
  }
  if (parsedBody.candidate_disposition && !parsedBody.disposition) {
    parsedBody.disposition = parsedBody.candidate_disposition;
  }

  const metadata = (parsedBody.metadata as Record<string, unknown>) || {};

  // Extract interviewId from body, metadata, or query params
  const interviewId = String(
    parsedBody.interview_id ||
      parsedBody.interviewId ||
      metadata.interview_id ||
      metadata.interviewId ||
      searchParams.get("interview_id") ||
      searchParams.get("interviewId") ||
      ""
  ).trim();

  const attemptId = String(
    parsedBody.attempt_id ||
      parsedBody.attemptId ||
      searchParams.get("attempt_id") ||
      ""
  ).trim();

  const interactionId = cleanSarvamId(
    (parsedBody.interaction_id as string) ||
      (parsedBody.interactionId as string) ||
      (searchParams.get("interaction_id") ?? undefined)
  ) || "";

  if (!interviewId && !attemptId && !interactionId) {
    return errorResponse(
      "VALIDATION_ERROR",
      "interview_id or interviewId is required to sync interview results.",
      422
    );
  }

  const repository = getInterviewRepository();

  // 2. Idempotency Check
  const eventId =
    req.headers.get("x-sarvam-event-id") ||
    req.headers.get("x-request-id") ||
    `result_${interviewId || attemptId || interactionId}_${crypto.createHash("md5").update(rawBody || interviewId).digest("hex").slice(0, 8)}`;

  const alreadyProcessed = await repository.isEventProcessed(eventId);
  if (alreadyProcessed) {
    const existing = interviewId ? await repository.getInterview(interviewId) : null;
    return successResponse({ processed: false, duplicate: true, interview: existing });
  }

  // 3. Locate Target Interview
  let interview = interviewId ? await repository.getInterview(interviewId) : null;
  if (!interview && attemptId) {
    interview = await repository.findByProviderCallId(attemptId);
  }
  if (!interview && interactionId) {
    interview = await repository.findByProviderCallId(interactionId);
  }

  if (!interview) {
    logger.warn("No interview found for Sarvam result sync", { interviewId, attemptId, interactionId });
    await repository.markEventProcessed(eventId);
    return errorResponse("NOT_FOUND", `Interview '${interviewId || attemptId || interactionId}' was not found.`, 404);
  }

  const targetInterviewId = interview.id;
  const providerCallId = attemptId || interactionId || interview.call.providerCallId;

  // 4. Normalize Body Results
  const normalizedBody = normalizeSarvamResult(parsedBody as Parameters<typeof normalizeSarvamResult>[0]);
  const rawStatus = typeof parsedBody.status === "string" ? parsedBody.status : "completed";
  const mappedStatus = mapSarvamCallStatus(rawStatus);

  let recordingUrl =
    (parsedBody.audio_url as string) ||
    (parsedBody.recording_url as string) ||
    (parsedBody.audio_uri as string) ||
    interview.call.recordingUrl ||
    undefined;

  // Save body data
  await repository.updateCallStatus(targetInterviewId, mappedStatus, {
    duration: normalizedBody.duration ?? interview.call.duration ?? undefined,
    disposition: normalizedBody.disposition ?? undefined,
    providerCallId: providerCallId || interview.call.providerCallId,
    interactionId: cleanSarvamId(interactionId) || cleanSarvamId(interview.call.interactionId),
    recordingUrl,
  });

  if (normalizedBody.transcript.length > 0) {
    await repository.saveTranscript(targetInterviewId, normalizedBody.transcript);
  }

  if (normalizedBody.questionAnswers.length > 0) {
    await repository.saveQuestionAnswers(targetInterviewId, normalizedBody.questionAnswers);
  }

  let outputVariables = {
    ...(interview.outputVariables || {}),
    ...normalizedBody.outputVariables,
    ...((parsedBody.agent_variables as Record<string, unknown>) || {}),
    ...((parsedBody.final_agent_variables as Record<string, unknown>) || {}),
    ...((parsedBody.output_variables as Record<string, unknown>) || {}),
  };

  if (Object.keys(outputVariables).length > 0) {
    await repository.updateInterview(targetInterviewId, {
      outputVariables,
    });
  }

  // 5. Fetch Additional Analytics from Sarvam AI
  const effectiveLookupId = interactionId || providerCallId;
  const sarvamClient = getSarvamClient();
  let syncResultDetails: unknown = null;

  if (effectiveLookupId) {
    try {
      const syncResult = await sarvamClient.fetchCallAnalytics(effectiveLookupId, targetInterviewId);
      syncResultDetails = syncResult;

      if (syncResult.success) {
        if (syncResult.status) {
          await repository.updateCallStatus(targetInterviewId, syncResult.status as CallStatus, {
            duration: syncResult.duration ?? undefined,
            providerCallId: syncResult.attemptId || providerCallId,
            interactionId: cleanSarvamId(syncResult.interactionId) || cleanSarvamId(interactionId) || cleanSarvamId(interview.call.interactionId),
            recordingUrl: syncResult.recordingUrl || recordingUrl,
          });
        }

        if (syncResult.transcript && syncResult.transcript.length > 0) {
          await repository.saveTranscript(targetInterviewId, syncResult.transcript);
        }

        if (syncResult.agentVariables && Object.keys(syncResult.agentVariables).length > 0) {
          outputVariables = {
            ...outputVariables,
            ...syncResult.agentVariables,
          };
          await repository.updateInterview(targetInterviewId, {
            outputVariables,
          });
        }
      }
    } catch (syncErr) {
      logger.warn("Analytics sync warning on result endpoint (non-fatal)", { syncErr });
    }
  }

  await repository.markEventProcessed(eventId);

  const updatedInterview = await repository.getInterview(targetInterviewId);

  return successResponse({
    success: true,
    processed: true,
    interviewId: targetInterviewId,
    interview: updatedInterview,
    sarvamResponse: syncResultDetails,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const interviewId = searchParams.get("interview_id") || searchParams.get("interviewId");

  if (!interviewId) {
    return errorResponse("INVALID_QUERY", "interview_id query parameter is required.", 400);
  }

  const repository = getInterviewRepository();
  const interview = await repository.getInterview(interviewId);

  if (!interview) {
    return errorResponse("NOT_FOUND", `Interview '${interviewId}' was not found.`, 404);
  }

  return successResponse({
    interviewId: interview.id,
    call: interview.call,
    questions: interview.questions,
    questionAnswers: interview.questionAnswers,
    outputVariables: interview.outputVariables,
    transcript: interview.transcript,
  });
}
