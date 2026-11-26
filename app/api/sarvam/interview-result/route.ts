import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { validateSarvamWebhook } from "@/lib/sarvam/security";
import { requireSarvamContextSecret, requireApiKeyOrSession } from "@/lib/security/api-guard";
import { mapSarvamCallStatus, normalizeSarvamResult, cleanSarvamId } from "@/lib/sarvam/mapper";
import { runPostCallProcessing } from "@/lib/processing/post-call";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { logger } from "@/lib/utils/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    // Empty body is acceptable if params are in searchParams
  }

  const { searchParams } = new URL(req.url);
  const queryParamsObj = Object.fromEntries(searchParams.entries());

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

  // Normalize aliases from Sarvam tool configurations
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

  // Extract interviewId, attemptId, interactionId
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

  // Log the incoming request
  console.log("[API] /api/sarvam/interview-result called with params:", {
    interview_id: interviewId || undefined,
    attempt_id: attemptId || undefined,
    interaction_id: interactionId || undefined,
    queryParams: Object.keys(queryParamsObj).length > 0 ? queryParamsObj : undefined,
    body: Object.keys(parsedBody).length > 0 ? parsedBody : rawBody || undefined,
  });

  // 1. Multi-tier Authentication Support:
  const webhookCheck = validateSarvamWebhook(rawBody, req.headers, req.nextUrl.searchParams);
  const contextCheck = requireSarvamContextSecret(req);
  const apiCheck = await requireApiKeyOrSession(req);

  if (!webhookCheck.valid && !contextCheck.authenticated && !apiCheck.authenticated) {
    return errorResponse("UNAUTHORIZED", "Valid context secret, webhook secret, or API key is required.", 401);
  }

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
    await repository.markEventProcessed(eventId);
    return errorResponse("NOT_FOUND", `Interview '${interviewId || attemptId || interactionId}' was not found.`, 404);
  }

  const targetInterviewId = interview.id;
  const providerCallId = attemptId || interactionId || interview.call.providerCallId;

  // 4. Save body-supplied results immediately (if Sarvam sent answers, transcript, etc. in payload)
  const normalizedBody = normalizeSarvamResult(parsedBody as Parameters<typeof normalizeSarvamResult>[0]);
  const rawStatus = typeof parsedBody.status === "string" ? parsedBody.status : "completed";
  const mappedStatus = mapSarvamCallStatus(rawStatus);

  const recordingUrl =
    (parsedBody.audio_url as string) ||
    (parsedBody.recording_url as string) ||
    (parsedBody.audio_uri as string) ||
    interview.call.recordingUrl ||
    undefined;

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

  const outputVariables = {
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

  // Mark event as processed before kicking off the pipeline
  await repository.markEventProcessed(eventId);

  // 5. Post-call processing pipeline with retry
  //    Wait up to 2 minutes (up to 10 attempts with 10s gap) until transcript is ready
  //    AND AI evaluation scores are generated.
  const MAX_ATTEMPTS = 10;
  let postCallResult;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Wait 10 seconds before each attempt
    await new Promise((resolve) => setTimeout(resolve, 10_000));

    postCallResult = await runPostCallProcessing(targetInterviewId);

    const hasTranscript = Boolean(
      postCallResult.interview?.transcript &&
      postCallResult.interview.transcript.length > 0
    );
    const hasEvaluation = Boolean(
      postCallResult.interview?.evaluation?.score !== undefined &&
      postCallResult.interview.evaluation.score !== null
    );

    // If both transcript and evaluation are ready, exit retry loop immediately
    if (hasTranscript && hasEvaluation) {
      logger.info("[interview-result] Transcript and evaluation scores ready!", {
        interviewId: targetInterviewId,
        attempt,
        score: postCallResult.interview?.evaluation?.score,
      });
      break;
    }

    if (attempt < MAX_ATTEMPTS) {
      logger.info(`[interview-result] Waiting for transcript & scores (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in 10s...`, {
        interviewId: targetInterviewId,
        hasTranscript,
        hasEvaluation,
      });
    }
  }

  // Refresh interview data from repository to get latest state including scores
  const finalInterview =
    (await repository.getInterview(targetInterviewId)) ||
    postCallResult?.interview ||
    interview;

  // Build the structured JSON payload
  const finalCallData = {
    status: finalInterview.call.status,
    provider: finalInterview.call.provider,
    providerCallId: finalInterview.call.providerCallId || "",
    interactionId: finalInterview.call.interactionId || "",
    startedAt: finalInterview.call.startedAt || "",
    answeredAt: finalInterview.call.answeredAt || "",
    endedAt: finalInterview.call.endedAt || "",
    duration: finalInterview.call.duration ?? 0,
    disposition: finalInterview.call.disposition || "",
    failureReason: finalInterview.call.failureReason || "",
    recordingUrl: finalInterview.call.recordingUrl || "",
    channelInfo: {
      channelType:
        finalInterview.call.channelInfo?.channelType ||
        finalInterview.call.channelInfo?.channel_type ||
        "",
      channelProvider:
        finalInterview.call.channelInfo?.channelProvider ||
        finalInterview.call.channelInfo?.channel_provider ||
        "",
      agentPhoneNumber:
        finalInterview.call.channelInfo?.agentPhoneNumber ||
        finalInterview.call.channelInfo?.agent_phone_number ||
        "",
    },
  };

  const finalSarvamData = {
    attempt_id:
      (parsedBody.attempt_id as string) ||
      (parsedBody.attemptId as string) ||
      finalInterview.call.providerCallId ||
      "",
    interaction_id:
      (parsedBody.interaction_id as string) ||
      (parsedBody.interactionId as string) ||
      finalInterview.call.interactionId ||
      "",
    status: (parsedBody.status as string) || finalInterview.call.status,
    duration:
      (typeof parsedBody.duration === "number"
        ? parsedBody.duration
        : finalInterview.call.duration) ?? 0,
    disposition:
      (parsedBody.disposition as string) || finalInterview.call.disposition || "",
    failure_reason:
      (parsedBody.failure_reason as string) ||
      finalInterview.call.failureReason ||
      "",
    audio_url:
      (parsedBody.audio_url as string) ||
      (parsedBody.recording_url as string) ||
      (parsedBody.audio_uri as string) ||
      finalInterview.call.recordingUrl ||
      "",
    channel_info: {
      channel_type:
        (parsedBody.channel_info as Record<string, string>)?.channel_type ||
        finalInterview.call.channelInfo?.channel_type ||
        finalInterview.call.channelInfo?.channelType ||
        "",
      channel_provider:
        (parsedBody.channel_info as Record<string, string>)?.channel_provider ||
        finalInterview.call.channelInfo?.channel_provider ||
        finalInterview.call.channelInfo?.channelProvider ||
        "",
      agent_phone_number:
        (parsedBody.channel_info as Record<string, string>)?.agent_phone_number ||
        finalInterview.call.channelInfo?.agent_phone_number ||
        finalInterview.call.channelInfo?.agentPhoneNumber ||
        "",
    },
    agent_variables:
      (parsedBody.agent_variables as Record<string, unknown>) || {
        interview_id: finalInterview.id,
      },
    output_variables:
      (parsedBody.output_variables as Record<string, unknown>) ||
      finalInterview.outputVariables ||
      {},
  };

  const interviewConversation = (finalInterview.transcript || []).map((entry) => ({
    speaker: entry.speaker,
    text: entry.text,
    timestamp: entry.timestamp || "",
  }));

  const score = finalInterview.evaluation?.score ?? 0;

  const scoreData = finalInterview.evaluation
    ? {
        score: finalInterview.evaluation.score,
        interviewSummary: finalInterview.evaluation.interviewSummary,
        fitForRole: finalInterview.evaluation.fitForRole,
        strength: finalInterview.evaluation.strength,
        weekness:
          finalInterview.evaluation.weekness ||
          finalInterview.evaluation.weakness ||
          [],
        skillAlignment: (finalInterview.evaluation.skillAlignment || []).map((s) => ({
          roleRequired: s.roleRequired,
          candidateAligned: s.candidateAligned,
          summary: s.summary,
        })),
        generatedAt: finalInterview.evaluation.generatedAt || "",
        modelUsed: finalInterview.evaluation.modelUsed || "",
      }
    : null;

  const completedCallPayload = {
    resumeDataId: finalInterview.candidate.id,
    callId: finalInterview.id,
    callData: finalCallData,
    sarvamData: finalSarvamData,
    interviewConversation,
    score,
    scoreData,
    status: finalInterview.call.status,
  };

  // Log final structured JSON
  console.log(
    "[interview-result] Completed call payload:\n" +
      JSON.stringify(completedCallPayload, null, 2)
  );

  if (finalInterview.evaluation) {
    console.log(`[interview-result] Score generated: ${finalInterview.evaluation.score}`, {
      interviewId: targetInterviewId,
    });
  } else {
    logger.warn("interview-result: pipeline finished without generating score", {
      interviewId: targetInterviewId,
      hasTranscript: !!finalInterview.transcript?.length,
    });
  }

  // Send completed interview data and scores to backend API ONLY IF DATA IS READY
  const hasCompleteData = Boolean(
    finalInterview.evaluation &&
    finalInterview.evaluation.score !== undefined &&
    finalInterview.transcript &&
    finalInterview.transcript.length > 0
  );

  if (hasCompleteData) {
    try {
      const { sendBackendInterviewData } = await import("@/lib/backend/client");
      const backendRes = await sendBackendInterviewData(completedCallPayload);

      if (!backendRes.success) {
        logger.error("[interview-result] Backend interview data submit returned failure", {
          interviewId: targetInterviewId,
          resumeDataId: finalInterview.candidate.id,
          error: backendRes.error,
          details: backendRes.data,
        });
      }
    } catch (backendErr) {
      logger.error("[interview-result] Error submitting interview data to backend", {
        interviewId: targetInterviewId,
        resumeDataId: finalInterview.candidate.id,
        error: backendErr instanceof Error ? backendErr.message : backendErr,
      });
    }
  } else if (finalInterview.call.status === "incomplete") {
    // Notify external backend micro-frontend that the call ended incomplete
    try {
      const { sendBackendStatusUpdate, sendBackendInterviewData } = await import("@/lib/backend/client");
      await sendBackendStatusUpdate({
        resumeDataId: finalInterview.candidate.id,
        status: "INCOMPLETE",
        interviewId: targetInterviewId,
      });
      await sendBackendInterviewData({
        ...completedCallPayload,
        score: 0,
        scoreData: null,
        status: "INCOMPLETE",
      });
      logger.info("[interview-result] Submitted INCOMPLETE call status to backend micro-frontend", {
        interviewId: targetInterviewId,
      });
    } catch (backendErr) {
      logger.error("[interview-result] Error submitting incomplete call status to backend", {
        interviewId: targetInterviewId,
        error: backendErr instanceof Error ? backendErr.message : backendErr,
      });
    }
  } else {
    logger.warn("[interview-result] Transcript or evaluation scores are not yet ready. Skipped backend submission to avoid sending incomplete data.", {
      interviewId: targetInterviewId,
      hasTranscript: Boolean(finalInterview.transcript?.length),
      hasEvaluation: Boolean(finalInterview.evaluation),
    });
  }

  return successResponse({
    processed: true,
    interviewId: targetInterviewId,
    evaluationGenerated: postCallResult?.evaluationGenerated ?? false,
    interview: postCallResult?.interview ?? null,
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

  // If sync=true query param is present, run the full post-call processing pipeline
  const shouldSync = searchParams.get("sync") === "true";
  if (shouldSync) {
    const postCallResult = await runPostCallProcessing(interview.id);

    return successResponse({
      interviewId: interview.id,
      synced: true,
      evaluationGenerated: postCallResult.evaluationGenerated,
      processingLog: postCallResult.processingLog,
      interview: postCallResult.interview,
    });
  }

  return successResponse({
    interviewId: interview.id,
    call: interview.call,
    questions: interview.questions,
    questionAnswers: interview.questionAnswers,
    outputVariables: interview.outputVariables,
    transcript: interview.transcript,
    evaluation: interview.evaluation,
  });
}
