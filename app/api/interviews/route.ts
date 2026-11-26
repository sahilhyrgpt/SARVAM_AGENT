import { NextRequest } from "next/server";
import { getInterviewRepository } from "@/lib/storage";
import { createInterviewSchema, interviewQuerySchema } from "@/lib/validation/interview";
import { requireApiKeyOrSession } from "@/lib/security/api-guard";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { normalizePhoneNumber } from "@/lib/utils/phone";
import { errorResponse, successResponse } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiKeyOrSession(req);
  if (!auth.authenticated) {
    return errorResponse("UNAUTHORIZED", auth.error || "Authentication required.", 401);
  }

  const { searchParams } = new URL(req.url);
  const queryParams = {
    page: searchParams.get("page") || undefined,
    limit: searchParams.get("limit") || undefined,
    status: searchParams.get("status") || undefined,
    search: searchParams.get("search") || undefined,
  };

  const parsed = interviewQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid query parameters.", 400, parsed.error.format());
  }

  const repository = getInterviewRepository();
  const result = await repository.listInterviews(parsed.data);

  return successResponse(result);
}

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyOrSession(req);
  if (!auth.authenticated) {
    return errorResponse("UNAUTHORIZED", auth.error || "Authentication required.", 401);
  }

  const clientIp = getClientIp(req);
  const rateLimit = await checkRateLimit(`create_interview_${clientIp}`, {
    intervalSeconds: 60,
    maxRequests: 30,
  });

  if (!rateLimit.success) {
    return errorResponse("RATE_LIMIT_EXCEEDED", "Rate limit exceeded. Please slow down.", 429);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Invalid JSON payload in request body.", 400);
  }

  // Extract company name from root or nested fields
  const rawCompanyName =
    body.company_name ||
    body.company ||
    body.job?.company_name ||
    body.job?.company ||
    "";
  const companyName = typeof rawCompanyName === "string" ? rawCompanyName.trim() : "";

  // Normalize candidate fields (support flat or nested structure)
  const normalizedCandidate = body.candidate
    ? {
        id: body.candidate.id || body.candidate_id || `CAN-${Date.now()}`,
        name: body.candidate.name || body.candidate_name || "",
        phone: body.candidate.phone || body.candidate_phone || body.phone || "",
        email: body.candidate.email || body.candidate_email || body.email || undefined,
      }
    : {
        id: body.candidate_id || `CAN-${Date.now()}`,
        name: body.candidate_name || "",
        phone: body.candidate_phone || body.phone || "",
        email: body.candidate_email || body.email || undefined,
      };

  // Normalize job fields (support flat or nested structure)
  const normalizedJob = body.job
    ? {
        id: body.job.id || body.job_id || `JOB-${Date.now()}`,
        title: body.job.title || body.job_title || "",
        description: body.job.description || body.job_description || "",
        company_name: companyName,
        skills: body.job.skills,
      }
    : {
        id: body.job_id || `JOB-${Date.now()}`,
        title: body.job_title || "",
        description: body.job_description || "",
        company_name: companyName,
        skills: body.skills,
      };

  // Normalize questions (support string[] or {id, question}[])
  const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
  const normalizedQuestions = rawQuestions.map((q: unknown, idx: number) => {
    if (typeof q === "string") {
      return { id: `q${idx + 1}`, question: q.trim() };
    }
    if (typeof q === "object" && q !== null) {
      const qObj = q as Record<string, unknown>;
      return {
        id: String(qObj.id || `q${idx + 1}`),
        question: String(qObj.question || qObj.text || "").trim(),
      };
    }
    return { id: `q${idx + 1}`, question: String(q) };
  });

  const normalizedPayload = {
    ...body,
    id: body.id || body.interview_id,
    company_name: companyName,
    candidate: normalizedCandidate,
    job: normalizedJob,
    questions: normalizedQuestions,
  };

  const parsed = createInterviewSchema.safeParse(normalizedPayload);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    return errorResponse("VALIDATION_ERROR", "Validation failed for interview payload.", 422, errorDetails);
  }

  const { candidate, job, questions } = parsed.data;

  // Normalize phone number
  const { normalized: normalizedPhone, isValid } = normalizePhoneNumber(candidate.phone);
  if (!isValid) {
    return errorResponse(
      "INVALID_PHONE_NUMBER",
      `Phone number '${candidate.phone}' is not a valid format. Expected valid phone number with or without country code.`,
      422
    );
  }

  // Extract and normalize skills from root body or job object
  const rawSkills = [
    ...(Array.isArray(body?.skills) ? body.skills : []),
    ...(Array.isArray(job?.skills) ? job.skills : []),
  ];

  const normalizedSkills: string[] = Array.from(
    new Set(
      rawSkills
        .map((s: unknown) => {
          if (typeof s === "string") return s.trim();
          if (typeof s === "object" && s && "name" in s) return String((s as any).name).trim();
          return "";
        })
        .filter((s: string) => s.length > 0)
    )
  );

  const repository = getInterviewRepository();
  const explicitId = (body.interview_id as string) || (body.id as string) || undefined;
  const interview = await repository.createInterview({
    id: explicitId,
    company_name: companyName,
    candidate: {
      ...candidate,
      phone: normalizedPhone,
    },
    job: {
      ...job,
      company_name: companyName,
      skills: normalizedSkills,
    },
    skills: normalizedSkills,
    questions,
  });

  return successResponse({ interview }, {}, 201);
}
