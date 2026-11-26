import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { requireApiKeyOrSession } from "@/lib/security/api-guard";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { runPostCallProcessing } from "@/lib/processing/post-call";

export const dynamic = "force-dynamic";

/**
 * POST /api/interviews/[id]/post-call-process
 *
 * Dedicated post-call processing pipeline that runs everything IN SERIES:
 *   Step 1: Sync call details from Sarvam (status, duration, recording URL, interaction ID)
 *   Step 2: Fetch transcript from Sarvam Analytics API
 *   Step 3: Save transcript & extract question-answer mappings
 *   Step 4: Generate AI evaluation scores via OpenAI
 *
 * Called automatically by:
 *   - Frontend dashboard when a call status transitions to "completed"
 *   - Sarvam webhook handler when receiving a completed status
 *   - Can also be triggered manually via API
 */
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

  const result = await runPostCallProcessing(id);

  return successResponse(result);
}
