import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { requireApiKeyOrSession } from "@/lib/security/api-guard";
import { errorResponse, successResponse } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(
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

  return successResponse(interview);
}
