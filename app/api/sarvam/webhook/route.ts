import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { sarvamWebhookPayloadSchema } from "@/lib/validation/sarvam";
import { validateSarvamWebhook } from "@/lib/sarvam/security";
import { normalizeSarvamWebhookPayload, cleanSarvamId } from "@/lib/sarvam/mapper";
import { getSarvamClient } from "@/lib/sarvam/client";
import { runPostCallProcessing } from "@/lib/processing/post-call";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { logger } from "@/lib/utils/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return errorResponse("INVALID_BODY", "Could not read request body.", 400);
  }

  // 1. Webhook Security Verification
  const securityCheck = validateSarvamWebhook(rawBody, req.headers, req.nextUrl.searchParams);
  if (!securityCheck.valid) {
    logger.warn("Sarvam Webhook rejected: invalid security verification", {
      reason: securityCheck.reason,
    });
    return errorResponse("UNAUTHORIZED", securityCheck.reason || "Webhook authentication failed.", 401);
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse("INVALID_JSON", "Payload is not valid JSON.", 400);
  }

  const parsed = sarvamWebhookPayloadSchema.safeParse(parsedBody);
  if (!parsed.success) {
    logger.warn("Sarvam Webhook payload validation failed", { errors: parsed.error.format() });
    return errorResponse("VALIDATION_ERROR", "Webhook schema validation failed.", 422, parsed.error.format());
  }

  const payload = parsed.data;
  const repository = getInterviewRepository();

  // 2. Webhook Idempotency Check
  const eventId =
    req.headers.get("x-sarvam-event-id") ||
    req.headers.get("x-request-id") ||
    `${payload.attempt_id}_${payload.status}_${crypto.createHash("md5").update(rawBody).digest("hex").slice(0, 8)}`;

  const alreadyProcessed = await repository.isEventProcessed(eventId);
  if (alreadyProcessed) {
    return successResponse({ processed: false, duplicate: true });
  }

  // 3. Locate Target Interview
  // Check webhook_config metadata first, then provider call ID
  const metadataInterviewId = payload.webhook_config?.metadata?.interview_id as string | undefined;
  let targetInterview = metadataInterviewId
    ? await repository.getInterview(metadataInterviewId)
    : null;

  if (!targetInterview) {
    targetInterview = await repository.findByProviderCallId(payload.attempt_id);
  }

  if (!targetInterview) {
    logger.warn("No matching interview found for Sarvam Webhook attempt_id", {
      attemptId: payload.attempt_id,
      metadataInterviewId,
    });
    // Return 200 OK so Sarvam does not continually retry unlinked events
    await repository.markEventProcessed(eventId);
    return successResponse({ processed: false, warning: "Interview not found" });
  }

  // 4. Normalize & Apply Status & Data Updates
  const normalized = normalizeSarvamWebhookPayload(payload);

  // 5. Resolve interaction_id.
  //    Per Sarvam docs the webhook delivers interaction_id for connected calls,
  //    but may send the sentinel "NO_INTERACTION_ID" instead of null.
  //    cleanSarvamId() in the mapper already filters sentinels.
  //    If still missing, query the Sarvam Analytics /attempts API to look it up.
  let resolvedInteractionId = normalized.interactionId;
  let resolvedRecordingUrl: string | undefined = undefined;
  let resolvedDuration = normalized.duration;

  if (!resolvedInteractionId && payload.attempt_id) {
    try {
      const sarvamClient = getSarvamClient();
      const attemptInfo = await sarvamClient.fetchInteractionByAttemptId(
        payload.attempt_id,
        targetInterview.id
      );
      if (attemptInfo) {
        resolvedInteractionId = cleanSarvamId(attemptInfo.interactionId);
        resolvedRecordingUrl = attemptInfo.recordingUrl;
        if (attemptInfo.duration && !resolvedDuration) {
          resolvedDuration = attemptInfo.duration;
        }
      }
    } catch (lookupErr) {
      logger.warn("Failed to resolve interaction_id from /attempts API (non-fatal)", {
        attemptId: payload.attempt_id,
        error: lookupErr,
      });
    }
  }

  await repository.updateCallStatus(targetInterview.id, normalized.status, {
    providerCallId: payload.attempt_id,
    interactionId: resolvedInteractionId,
    recordingUrl: resolvedRecordingUrl,
    duration: resolvedDuration ?? undefined,
    failureReason: normalized.failureReason ?? undefined,
    disposition: (normalized.finalVariables.disposition as string) || undefined,
    channelInfo: normalized.channelInfo,
  });

  // Mark event as processed
  await repository.markEventProcessed(eventId);

  // If status is NO_ANSWER or no interaction_id is present, do not continue further.
  // Update status back to backend and exit early.
  const rawStatusUpper = (payload.status || "").toUpperCase();
  const isNoAnswer =
    rawStatusUpper === "NO_ANSWER" ||
    normalized.status === "no_answer" ||
    ["busy", "rejected", "failed", "voicemail", "cancelled", "connection_error"].includes(normalized.status);
  const hasNoInteractionId = !resolvedInteractionId;

  if (isNoAnswer || hasNoInteractionId) {
    const statusToSend =
      rawStatusUpper === "NO_ANSWER" || normalized.status === "no_answer"
        ? "NO_ANSWER"
        : (rawStatusUpper || normalized.status.toUpperCase().replace(/[- ]/g, "_"));

    try {
      const { sendBackendStatusUpdate } = await import("@/lib/backend/client");
      const backendRes = await sendBackendStatusUpdate({
        resumeDataId: targetInterview.candidate.id,
        status: statusToSend,
        interviewId: targetInterview.id,
      });

      if (!backendRes.success) {
        logger.error("[Sarvam Webhook] Backend status update failed", {
          interviewId: targetInterview.id,
          resumeDataId: targetInterview.candidate.id,
          status: statusToSend,
          error: backendRes.error,
        });
      }
    } catch (err) {
      logger.error("[Sarvam Webhook] Error calling backend update-status", {
        interviewId: targetInterview.id,
        resumeDataId: targetInterview.candidate.id,
        error: err instanceof Error ? err.message : err,
      });
    }

    logger.info("[Sarvam Webhook] Call uncompleted (no answer or no interaction ID). Status updated to backend. Stopped further processing.", {
      interviewId: targetInterview.id,
      status: statusToSend,
    });

    return successResponse({
      processed: true,
      interviewId: targetInterview.id,
      status: normalized.status,
      backendStatus: statusToSend,
    });
  }

  // Save transcript turns if delivered in the webhook payload
  if (normalized.transcript && normalized.transcript.length > 0) {
    await repository.saveTranscript(targetInterview.id, normalized.transcript);
  }

  // Save final variables if present
  if (normalized.finalVariables && Object.keys(normalized.finalVariables).length > 0) {
    await repository.updateInterview(targetInterview.id, {
      outputVariables: normalized.finalVariables,
    });
  }

  // 6. If call completed, run the full post-call processing pipeline
  //    This handles: Sarvam data sync → transcript fetch → Q&A mapping → AI score generation
  //    Runs asynchronously (fire-and-forget) so the webhook responds to Sarvam quickly
  if (["completed", "score_generated"].includes(normalized.status)) {
    // Fire-and-forget: don't await so Sarvam gets a fast 200 response
    runPostCallProcessing(targetInterview.id)
      .then(async (res) => {
        if (res.evaluationGenerated && res.interview?.evaluation && res.interview.transcript?.length) {
          const freshInterview = res.interview;
          const evaluation = freshInterview.evaluation;
          if (!evaluation) return;

          try {
            const { sendBackendInterviewData } = await import("@/lib/backend/client");
            await sendBackendInterviewData({
              resumeDataId: freshInterview.candidate.id,
              callId: freshInterview.id,
              callData: {
                status: freshInterview.call.status,
                provider: freshInterview.call.provider,
                providerCallId: freshInterview.call.providerCallId || "",
                interactionId: freshInterview.call.interactionId || "",
                startedAt: freshInterview.call.startedAt || "",
                answeredAt: freshInterview.call.answeredAt || "",
                endedAt: freshInterview.call.endedAt || "",
                duration: freshInterview.call.duration ?? 0,
                disposition: freshInterview.call.disposition || "",
                failureReason: freshInterview.call.failureReason || "",
                recordingUrl: freshInterview.call.recordingUrl || "",
                channelInfo: {
                  channelType:
                    freshInterview.call.channelInfo?.channelType ||
                    freshInterview.call.channelInfo?.channel_type ||
                    "",
                  channelProvider:
                    freshInterview.call.channelInfo?.channelProvider ||
                    freshInterview.call.channelInfo?.channel_provider ||
                    "",
                  agentPhoneNumber:
                    freshInterview.call.channelInfo?.agentPhoneNumber ||
                    freshInterview.call.channelInfo?.agent_phone_number ||
                    "",
                },
              },
              sarvamData: {
                attempt_id: payload.attempt_id,
                interaction_id: resolvedInteractionId || "",
                status: normalized.status,
                duration: resolvedDuration ?? 0,
                disposition: (normalized.finalVariables.disposition as string) || "",
                failure_reason: normalized.failureReason || "",
                audio_url: resolvedRecordingUrl || "",
                channel_info: normalized.channelInfo || {},
                agent_variables: { interview_id: freshInterview.id },
                output_variables: freshInterview.outputVariables || {},
              },
              interviewConversation: (freshInterview.transcript || []).map((t) => ({
                speaker: t.speaker,
                text: t.text,
                timestamp: t.timestamp || "",
              })),
              score: evaluation.score,
              scoreData: {
                score: evaluation.score,
                interviewSummary: evaluation.interviewSummary,
                fitForRole: evaluation.fitForRole,
                strength: evaluation.strength,
                weekness: evaluation.weekness || evaluation.weakness || [],
                skillAlignment: (evaluation.skillAlignment || []).map((s) => ({
                  roleRequired: s.roleRequired,
                  candidateAligned: s.candidateAligned,
                  summary: s.summary,
                })),
                generatedAt: evaluation.generatedAt || "",
                modelUsed: evaluation.modelUsed || "",
              },
              status: freshInterview.call.status,
            });
            logger.info("[Sarvam Webhook] Successfully submitted completed interview data to backend", {
              interviewId: freshInterview.id,
              score: evaluation.score,
            });
          } catch (submitErr) {
            logger.error("[Sarvam Webhook] Error submitting completed interview to backend", {
              interviewId: freshInterview.id,
              error: submitErr instanceof Error ? submitErr.message : submitErr,
            });
          }
        }
      })
      .catch((err) => {
        logger.warn("Post-call processing triggered from webhook failed (non-fatal)", {
          interviewId: targetInterview!.id,
          error: err instanceof Error ? err.message : err,
        });
      });

    logger.info("Webhook triggered post-call processing pipeline", {
      interviewId: targetInterview.id,
      webhookStatus: normalized.status,
    });
  }

  return successResponse({
    processed: true,
    interviewId: targetInterview.id,
    status: normalized.status,
  });
}
