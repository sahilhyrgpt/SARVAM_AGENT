import { CallStatus, QuestionAnswer, TranscriptEntry } from "@/types/interview";
import {
  SarvamResultPayload,
  SarvamTranscriptTurn,
  SarvamWebhookPayload,
} from "@/types/sarvam";

/**
 * Sarvam API sends sentinel strings like "NO_INTERACTION_ID", "NO_CAMPAIGN_ID",
 * "NO_COHORT_ID", "NO_FAILURE_REASON" instead of null when a value is not
 * available.  This helper returns true for those sentinel values so we can
 * treat them as missing/undefined throughout the codebase.
 *
 * Reference: https://docs.sarvam.ai/conversations/api/instant-outbound/webhook-payload
 */
const SARVAM_SENTINEL_PREFIXES = ["NO_", "UNKNOWN", "N/A", "NONE", "NULL"];

export function isSarvamSentinel(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  const upper = trimmed.toUpperCase();
  return SARVAM_SENTINEL_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

/**
 * Return the value only if it's a real Sarvam ID (not a sentinel).
 * Returns undefined for sentinels so they are never persisted to MongoDB.
 */
export function cleanSarvamId(value: string | null | undefined): string | undefined {
  if (isSarvamSentinel(value)) return undefined;
  return value!.trim();
}

/**
 * Map raw Sarvam telephony statuses to internal CallStatus enum
 */
export function mapSarvamCallStatus(rawStatus?: string | null): CallStatus {
  if (!rawStatus) return "unknown";

  const normalized = rawStatus.toLowerCase().trim();

  switch (normalized) {
    case "created":
    case "initiated":
    case "initiating":
    case "queued":
      return "initiating";
    case "ringing":
      return "ringing";
    case "answered":
    case "in-progress":
    case "in_progress":
      return "in_progress";
    case "connected":
    case "completed":
    case "ended":
    case "success":
      return "completed";
    case "no_answer":
    case "no-answer":
    case "unanswered":
    case "timeout":
      return "no_answer";
    case "busy":
      return "busy";
    case "rejected":
    case "declined":
      return "rejected";
    case "failed":
    case "error":
      return "failed";
    case "voicemail":
    case "answering_machine":
      return "voicemail";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "connection_error":
    case "network_error":
      return "connection_error";
    default:
      return "unknown";
  }
}

/**
 * Normalize Sarvam transcript turns to internal TranscriptEntry[]
 * Handles arrays, objects with messages/turns/items, and various speaker/text field names
 */
export function normalizeSarvamTranscript(
  rawTranscript?: unknown
): TranscriptEntry[] {
  if (!rawTranscript) return [];

  let list: unknown[] = [];

  if (Array.isArray(rawTranscript)) {
    list = rawTranscript;
  } else if (typeof rawTranscript === "object" && rawTranscript !== null) {
    const obj = rawTranscript as Record<string, unknown>;
    if (Array.isArray(obj.transcript)) {
      list = obj.transcript;
    } else if (Array.isArray(obj.interaction_transcript)) {
      list = obj.interaction_transcript;
    } else if (Array.isArray(obj.messages)) {
      list = obj.messages;
    } else if (Array.isArray(obj.turns)) {
      list = obj.turns;
    } else if (Array.isArray(obj.items)) {
      list = obj.items;
    } else {
      list = Object.values(obj).filter((v) => typeof v === "object" && v !== null);
    }
  }

  const results: TranscriptEntry[] = [];

  for (const rawTurn of list) {
    if (!rawTurn || typeof rawTurn !== "object") continue;

    const turn = rawTurn as Record<string, unknown>;
    const rawRole = String(
      turn.role || turn.speaker || turn.sender || turn.from || turn.type || ""
    ).toLowerCase();

    let speaker: "agent" | "candidate" | "system" = "agent";

    if (
      rawRole.includes("user") ||
      rawRole.includes("candidate") ||
      rawRole.includes("caller") ||
      rawRole.includes("human") ||
      rawRole.includes("client")
    ) {
      speaker = "candidate";
    } else if (
      rawRole.includes("agent") ||
      rawRole.includes("bot") ||
      rawRole.includes("assistant") ||
      rawRole.includes("ai") ||
      rawRole.includes("system_prompt")
    ) {
      speaker = "agent";
    } else if (rawRole.includes("system")) {
      speaker = "system";
    }

    const rawText =
      turn.en_text ||
      turn.text ||
      turn.message ||
      turn.content ||
      turn.transcript ||
      turn.user_input ||
      turn.agent_output ||
      "";

    const text =
      typeof rawText === "string"
        ? rawText.trim()
        : typeof rawText === "object"
        ? JSON.stringify(rawText)
        : String(rawText || "").trim();

    if (!text) continue;

    const timestamp = turn.timestamp
      ? String(turn.timestamp)
      : turn.created_at
      ? String(turn.created_at)
      : undefined;

    if (speaker === "agent") {
      const parts = splitAssistantNudges(text);
      for (const part of parts) {
        results.push({
          speaker,
          text: part,
          timestamp,
        });
      }
    } else {
      results.push({
        speaker,
        text,
        timestamp,
      });
    }
  }

  return results;
}

const ASSISTANT_NUDGE_PATTERNS = [
  /(?=(?:Are you (?:still )?there\?))/i,
  /(?=(?:Can you speak a bit louder))/i,
  /(?=(?:It looks like the line went quiet))/i,
  /(?=(?:Should we continue, or would another time work better\?))/i,
];

export function splitAssistantNudges(text: string): string[] {
  if (!text) return [];
  let chunks = [text];
  for (const pat of ASSISTANT_NUDGE_PATTERNS) {
    const nextChunks: string[] = [];
    for (const c of chunks) {
      const parts = c.split(pat).map((s) => s.trim()).filter(Boolean);
      nextChunks.push(...parts);
    }
    chunks = nextChunks;
  }
  return chunks;
}

/**
 * Normalize complete Sarvam Result payload into internal interview fields
 */
export function normalizeSarvamResult(payload: SarvamResultPayload): {
  transcript: TranscriptEntry[];
  questionAnswers: QuestionAnswer[];
  outputVariables: Record<string, unknown>;
  disposition: string | null;
  duration?: number | null;
} {
  const transcript: TranscriptEntry[] = payload.transcript
    ? normalizeSarvamTranscript(payload.transcript)
    : [];

  const questionAnswers: QuestionAnswer[] = (payload.answers || []).map((ans, idx) => ({
    questionId: ans.questionId || ans.question_id || `q${idx + 1}`,
    question: ans.question || `Question ${idx + 1}`,
    answer: ans.answer || "",
    status: (ans.status || "answered") as QuestionAnswer["status"],
    followUps: ans.followUps ?? ans.follow_ups ?? 0,
    score: ans.score,
  }));

  const outputVariables = payload.output_variables || {};
  const disposition = payload.disposition || (outputVariables.disposition as string) || null;
  const duration = payload.duration;

  return {
    transcript,
    questionAnswers,
    outputVariables,
    disposition,
    duration,
  };
}

/**
 * Normalize Instant Outbound Webhook into internal fields.
 *
 * Per Sarvam webhook docs, `interaction_id` is:
 *   - A real string like "20250920/1ae056a30013510b66a6a0" when the call connected
 *   - null when the call did not connect (no_answer, busy, failed)
 *   - The sentinel string "NO_INTERACTION_ID" in some edge-cases
 *
 * We use cleanSarvamId() to treat sentinels as undefined.
 */
export function normalizeSarvamWebhookPayload(payload: SarvamWebhookPayload) {
  const status = mapSarvamCallStatus(payload.status);
  const transcript = normalizeSarvamTranscript(payload.interaction_transcript);
  const duration = payload.duration;
  const failureReason = isSarvamSentinel(payload.failure_reason) ? undefined : payload.failure_reason;
  const providerCallId = cleanSarvamId(payload.attempt_id) || cleanSarvamId(payload.interaction_id);
  const interactionId = cleanSarvamId(payload.interaction_id);
  const finalVariables = payload.final_agent_variables || {};

  return {
    status,
    transcript,
    duration,
    failureReason,
    providerCallId,
    interactionId,
    finalVariables,
    channelInfo: payload.channel_info,
  };
}
