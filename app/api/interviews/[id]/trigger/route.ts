import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { getSarvamClient } from "@/lib/sarvam/client";
import { requireApiKeyOrSession } from "@/lib/security/api-guard";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { logger } from "@/lib/utils/logger";

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

  const clientIp = getClientIp(req);
  const rateLimit = await checkRateLimit(`trigger_call_${clientIp}`, {
    intervalSeconds: 60,
    maxRequests: 10,
  });

  if (!rateLimit.success) {
    return errorResponse(
      "RATE_LIMIT_EXCEEDED",
      "Too many call trigger requests. Please wait a minute before trying again.",
      429
    );
  }

  const repository = getInterviewRepository();
  const interview = await repository.getInterview(id);

  if (!interview) {
    return errorResponse("NOT_FOUND", `Interview with ID '${id}' was not found.`, 404);
  }

  // Idempotency & Duplicate Call Protection:
  // Reject if a call is currently running
  const activeStatuses = ["initiating", "ringing", "answered", "in_progress"];
  if (activeStatuses.includes(interview.call.status)) {
    logger.warn("Call trigger rejected: Call is already active", {
      interviewId: id,
      currentStatus: interview.call.status,
    });
    return errorResponse(
      "CALL_ALREADY_IN_PROGRESS",
      "Interview call is already in progress.",
      409
    );
  }

  // Validate and normalize phone number
  const rawPhone = interview.candidate.phone;
  const { normalized: normalizedPhone, isValid } = normalizePhoneNumber(rawPhone);

  if (!isValid || !normalizedPhone) {
    return errorResponse(
      "INVALID_CANDIDATE_PHONE",
      `Candidate phone number '${rawPhone}' is invalid. Please update the interview with a valid phone number before triggering.`,
      422
    );
  }

  // Parse optional JSON body (e.g. company_name override or idempotencyKey)
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const companyNameOverride =
    typeof body.company_name === "string" && body.company_name.trim()
      ? body.company_name.trim()
      : undefined;

  if (companyNameOverride) {
    interview.company_name = companyNameOverride;
    if (interview.job) {
      interview.job.company_name = companyNameOverride;
    }
    await repository.updateInterview(id, {
      company_name: companyNameOverride,
      job: {
        ...interview.job,
        company_name: companyNameOverride,
      },
    });
  }

  // Check optional Idempotency-Key header or body
  const idempotencyKey =
    req.headers.get("idempotency-key") ||
    req.headers.get("x-idempotency-key") ||
    (typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined);

  // Set status to initiating before contacting telephony provider
  await repository.updateCallStatus(id, "initiating", {
    provider: "sarvam",
    startedAt: new Date().toISOString(),
  });

  if (idempotencyKey) {
    await repository.updateInterview(id, { idempotencyKey });
  }

  // Resolve application URL for webhooks
  const origin = req.headers.get("origin") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const appUrl =
    process.env.APP_URL ||
    (origin.startsWith("http") ? origin : `${proto}://${origin}`) ||
    "http://localhost:3000";

  // Call Sarvam client
  const sarvamClient = getSarvamClient();
  const triggerResult = await sarvamClient.createOutboundCall(
    interview,
    normalizedPhone,
    appUrl
  );

  if (!triggerResult.success) {
    // Revert status to failed if trigger rejected
    await repository.updateCallStatus(id, "failed", {
      failureReason: triggerResult.error,
    });

    return errorResponse(
      "TRIGGER_CALL_FAILED",
      triggerResult.error || "Failed to trigger outbound call via Sarvam AI.",
      502,
      triggerResult.details
    );
  }

  // Store providerCallId (attempt_id)
  await repository.updateCallStatus(id, "initiating", {
    providerCallId: triggerResult.providerCallId,
  });

  return successResponse({
    interviewId: id,
    status: "initiating",
    provider: "sarvam",
    providerCallId: triggerResult.providerCallId,
  });
}
