import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { sarvamContextRequestSchema } from "@/lib/validation/sarvam";
import { requireSarvamContextSecret } from "@/lib/security/api-guard";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

async function handleContextRequest(req: NextRequest, interviewId?: string) {
  // Verify SARVAM_CONTEXT_SECRET
  const auth = requireSarvamContextSecret(req);
  if (!auth.authenticated) {
    logger.warn("Unauthorized Sarvam Context Tool request", { error: auth.error });
    return errorResponse("UNAUTHORIZED", auth.error || "Valid context authorization is required.", 401);
  }

  if (!interviewId) {
    return errorResponse("VALIDATION_ERROR", "interviewId or interview_id is required.", 422);
  }

  const repository = getInterviewRepository();
  const interview = await repository.getInterview(interviewId);

  if (!interview) {
    logger.warn("Sarvam context request for non-existent interview", { interviewId });
    return errorResponse("INTERVIEW_NOT_FOUND", `Interview '${interviewId}' was not found.`, 404);
  }

  const companyName = interview.company_name || interview.job.company_name || "";

  const responsePayload = {
    interviewId: interview.id,
    company_name: companyName,
    candidate: {
      id: interview.candidate.id,
      name: interview.candidate.name,
      phone: interview.candidate.phone,
      email: interview.candidate.email,
    },
    job: {
      id: interview.job.id,
      title: interview.job.title,
      description: interview.job.description,
      company_name: companyName,
    },
    questions: interview.questions.map((q) => ({
      id: q.id,
      question: q.question,
    })),
  };

  return successResponse(responsePayload);
}

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Invalid JSON body provided.", 400);
  }

  const parsed = sarvamContextRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "interviewId or interview_id is required.", 422);
  }

  const interviewId = parsed.data.interviewId || parsed.data.interview_id;
  return handleContextRequest(req, interviewId);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const interviewId =
    searchParams.get("interviewId") ||
    searchParams.get("interview_id") ||
    undefined;

  return handleContextRequest(req, interviewId);
}
