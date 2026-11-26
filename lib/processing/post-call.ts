import { getInterviewRepository } from "@/lib/storage";
import { getSarvamClient } from "@/lib/sarvam/client";
import { cleanSarvamId } from "@/lib/sarvam/mapper";
import { logger } from "@/lib/utils/logger";
import { CallStatus, Interview } from "@/types/interview";

export interface PostCallProcessResult {
  processed: boolean;
  interviewId: string;
  evaluationGenerated: boolean;
  processingLog: string[];
  interview: Interview | null;
}

/**
 * Core post-call processing pipeline that runs everything IN SERIES:
 *   Step 1: Sync call details from Sarvam (status, duration, recording URL, interaction ID)
 *   Step 2: Fetch transcript from Sarvam Analytics API
 *   Step 3: Save transcript & extract question-answer mappings
 *   Step 4: Generate AI evaluation scores via OpenAI
 *
 * Called from:
 *   - POST /api/interviews/[id]/post-call-process (API route, triggered by frontend)
 *   - POST /api/sarvam/webhook (when Sarvam sends completed status)
 *   - POST /api/interviews/[id]/sync (after syncing with Sarvam)
 */
export async function runPostCallProcessing(interviewId: string): Promise<PostCallProcessResult> {
  const repository = getInterviewRepository();
  let interview = await repository.getInterview(interviewId);

  if (!interview) {
    return {
      processed: false,
      interviewId,
      evaluationGenerated: false,
      processingLog: ["Interview not found"],
      interview: null,
    };
  }

  const processingLog: string[] = [];
  const sarvamClient = getSarvamClient();

  // ─── Step 1: Sync call details from Sarvam ─────────────────────────
  const providerCallId = cleanSarvamId(interview.call.providerCallId);
  const existingInteractionId = cleanSarvamId(interview.call.interactionId);
  const lookupKey = existingInteractionId || providerCallId || interviewId;

  let syncedInteractionId = existingInteractionId;
  let syncedAttemptId = providerCallId;

  try {
    const syncResult = await sarvamClient.fetchCallAnalytics(lookupKey, interviewId);

    if (syncResult.success) {
      // Update call status and metadata
      if (syncResult.status && syncResult.status !== "unknown") {
        await repository.updateCallStatus(interviewId, syncResult.status as CallStatus, {
          duration: syncResult.duration !== undefined ? syncResult.duration : interview.call.duration,
          providerCallId: syncResult.attemptId || providerCallId,
          interactionId: cleanSarvamId(syncResult.interactionId) || existingInteractionId,
          recordingUrl: syncResult.recordingUrl || `/api/interviews/${interviewId}/recording`,
        });
        processingLog.push(`Step 1: Synced call status → ${syncResult.status}, duration → ${syncResult.duration ?? "N/A"}s`);
      } else {
        processingLog.push("Step 1: Sarvam returned no definitive status, keeping current status");
      }

      // Track resolved IDs for transcript lookup
      syncedInteractionId = cleanSarvamId(syncResult.interactionId) || existingInteractionId;
      syncedAttemptId = syncResult.attemptId || providerCallId;

      // Save agent variables if present
      if (syncResult.agentVariables && Object.keys(syncResult.agentVariables).length > 0) {
        await repository.updateInterview(interviewId, {
          outputVariables: {
            ...(interview.outputVariables || {}),
            ...syncResult.agentVariables,
          },
        });
      }

      // If Sarvam analytics already returned transcript, save it now
      if (syncResult.transcript && syncResult.transcript.length > 0) {
        await repository.saveTranscript(interviewId, syncResult.transcript);
        processingLog.push(`Step 2: Transcript fetched from analytics (${syncResult.transcript.length} turns)`);
      }
    } else {
      processingLog.push(`Step 1: Sarvam sync failed → ${syncResult.error || "unknown error"}`);
    }
  } catch (syncErr) {
    const msg = syncErr instanceof Error ? syncErr.message : "Unknown sync error";
    processingLog.push(`Step 1: Sarvam sync error → ${msg}`);
    logger.warn("Post-call process: Sarvam sync failed", { interviewId, error: msg });
  }

  // Refresh interview from DB after sync
  interview = (await repository.getInterview(interviewId)) || interview;

  // ─── Step 2: Fetch transcript if not already present ───────────────
  if (!interview.transcript || interview.transcript.length === 0) {
    const transcriptLookupIds = [
      syncedInteractionId,
      syncedAttemptId,
      lookupKey,
    ].filter((x): x is string => !!x);

    // Remove duplicates
    const uniqueLookupIds = [...new Set(transcriptLookupIds)];

    for (const tid of uniqueLookupIds) {
      try {
        const transcriptEntries = await sarvamClient.fetchTranscript(tid);
        if (transcriptEntries.length > 0) {
          await repository.saveTranscript(interviewId, transcriptEntries);
          processingLog.push(`Step 2: Transcript fetched via direct lookup (${transcriptEntries.length} turns, key: ${tid})`);
          break;
        }
      } catch (tErr) {
        logger.warn("Post-call process: Transcript fetch attempt failed", { interviewId, lookupId: tid, error: tErr });
      }
    }

    // If still no transcript, try fetching interaction details first then transcript
    interview = (await repository.getInterview(interviewId)) || interview;
    if (!interview.transcript || interview.transcript.length === 0) {
      try {
        const attemptInfo = await sarvamClient.fetchInteractionByAttemptId(
          syncedAttemptId || lookupKey,
          interviewId
        );
        if (attemptInfo?.interactionId) {
          const transcriptEntries = await sarvamClient.fetchTranscript(attemptInfo.interactionId);
          if (transcriptEntries.length > 0) {
            await repository.saveTranscript(interviewId, transcriptEntries);
            processingLog.push(`Step 2: Transcript fetched via interaction lookup (${transcriptEntries.length} turns)`);

            // Also update interaction ID and recording
            if (attemptInfo.interactionId) {
              await repository.updateCallStatus(interviewId, interview.call.status, {
                interactionId: attemptInfo.interactionId,
                recordingUrl: attemptInfo.recordingUrl || `/api/interviews/${interviewId}/recording`,
                duration: attemptInfo.duration ?? interview.call.duration,
              });
            }
          }
        }
      } catch (lookupErr) {
        logger.warn("Post-call process: Interaction lookup failed", { interviewId, error: lookupErr });
      }
    }

    // Refresh again
    interview = (await repository.getInterview(interviewId)) || interview;
    if (!interview.transcript || interview.transcript.length === 0) {
      processingLog.push("Step 2: No transcript found from Sarvam after all attempts");
    }
  }

  // ─── Step 3: Q&A mapping (handled automatically by saveTranscript) ─
  // The repository.saveTranscript() method already calls extractQuestionAnswersFromTranscript()
  // and updates both transcript and questionAnswers. Verify it was done.
  interview = (await repository.getInterview(interviewId)) || interview;
  if (interview.questionAnswers && interview.questionAnswers.length > 0) {
    const answeredCount = interview.questionAnswers.filter((qa) => qa.answer).length;
    processingLog.push(`Step 3: Q&A mapping complete (${answeredCount}/${interview.questionAnswers.length} answered)`);
  } else if (interview.transcript && interview.transcript.length > 0) {
    processingLog.push("Step 3: Transcript present but no Q&A mapping extracted");
  } else {
    processingLog.push("Step 3: Skipped (no transcript available)");
  }

  // ─── Step 4: Generate AI evaluation scores ─────────────────────────
  let evaluationGenerated = false;

  if (interview.evaluation) {
    processingLog.push(`Step 4: Evaluation already exists (score: ${interview.evaluation.score}/100), skipping`);
    evaluationGenerated = true;
  } else if (!interview.transcript || interview.transcript.length === 0) {
    processingLog.push("Step 4: Cannot generate scores — no transcript available");
  } else if (!process.env.OPENAI_API_KEY) {
    processingLog.push("Step 4: Cannot generate scores — OPENAI_API_KEY not configured");
  } else {
    try {
      const { generateInterviewEvaluation, isInterviewEligibleForEvaluation } = await import("@/lib/openai/evaluator");
      const eligibility = isInterviewEligibleForEvaluation(
        interview.transcript,
        interview.questionAnswers
      );

      if (!eligibility.eligible) {
        processingLog.push(`Step 4: AI scoring skipped — ${eligibility.reason}`);
        logger.warn("Post-call process: Candidate responses insufficient for scoring", {
          interviewId,
          eligibility,
        });

        // Mark call status as incomplete
        await repository.updateCallStatus(interviewId, "incomplete");

        // Notify external backend / micro-frontend immediately
        try {
          const { sendBackendStatusUpdate, sendBackendInterviewData } = await import("@/lib/backend/client");

          // 1. Send status update to backend micro-frontend
          await sendBackendStatusUpdate({
            resumeDataId: interview.candidate.id,
            status: "INCOMPLETE",
            interviewId: interview.id,
          });

          // 2. Also send interview data with score 0 and INCOMPLETE status so other MFE gets all details
          const conversation = (interview.transcript || []).map((t) => ({
            speaker: t.speaker,
            text: t.text,
            timestamp: t.timestamp,
          }));

          await sendBackendInterviewData({
            resumeDataId: interview.candidate.id,
            callId: interview.id,
            callData: {
              status: "incomplete",
              provider: interview.call.provider,
              providerCallId: interview.call.providerCallId || "",
              interactionId: interview.call.interactionId || "",
              duration: interview.call.duration ?? 0,
              recordingUrl: interview.call.recordingUrl || "",
            },
            sarvamData: {
              attempt_id: interview.call.providerCallId,
              interaction_id: interview.call.interactionId,
              status: "incomplete",
            },
            interviewConversation: conversation,
            score: 0,
            scoreData: null,
            status: "INCOMPLETE",
          });

          processingLog.push("Step 4: Synced INCOMPLETE status and transcript to backend micro-frontend");
        } catch (backendErr) {
          const bMsg = backendErr instanceof Error ? backendErr.message : String(backendErr);
          logger.error("Post-call process: Error notifying backend of incomplete call", {
            interviewId,
            error: bMsg,
          });
          processingLog.push(`Step 4: Backend notification error → ${bMsg}`);
        }
      } else {
        const evaluation = await generateInterviewEvaluation({
          companyName: interview.company_name || interview.job.company_name,
          jobTitle: interview.job.title,
          jobDescription: interview.job.description,
          transcript: interview.transcript,
          skills: interview.skills || interview.job.skills,
        });

        await repository.updateInterview(interviewId, { evaluation });
        await repository.updateCallStatus(interviewId, "score_generated");
        evaluationGenerated = true;

        processingLog.push(`Step 4: AI evaluation generated (score: ${evaluation.score}/100, model: ${evaluation.modelUsed})`);
      }
    } catch (evalErr) {
      const msg = evalErr instanceof Error ? evalErr.message : "Unknown scoring error";
      processingLog.push(`Step 4: Score generation failed → ${msg}`);
      logger.error("Post-call process: AI scoring failed", { interviewId, error: msg });
    }
  }

  // ─── Final ─────────────────────────────────────────────────────────
  const finalInterview = await repository.getInterview(interviewId);

  logger.info("Post-call processing completed", {
    interviewId,
    steps: processingLog,
    hasTranscript: !!(finalInterview?.transcript && finalInterview.transcript.length > 0),
    hasEvaluation: !!finalInterview?.evaluation,
    finalStatus: finalInterview?.call.status,
  });

  return {
    processed: true,
    interviewId,
    evaluationGenerated,
    processingLog,
    interview: finalInterview,
  };
}
