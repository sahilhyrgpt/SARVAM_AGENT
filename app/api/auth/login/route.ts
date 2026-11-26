import { NextRequest } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { errorResponse, successResponse } from "@/lib/utils/response";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);

  // Rate limit login endpoint: max 5 attempts per 60 seconds per IP
  const rateLimit = await checkRateLimit(`login_${clientIp}`, {
    intervalSeconds: 60,
    maxRequests: 5,
  });

  if (!rateLimit.success) {
    logger.warn("Login rate limit exceeded", { clientIp });
    return errorResponse(
      "RATE_LIMIT_EXCEEDED",
      "Too many login attempts. Please try again in 1 minute.",
      429
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Invalid JSON payload in request body.", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    return errorResponse("VALIDATION_ERROR", "Invalid email or password format.", 422, errorDetails);
  }

  const { email, password } = parsed.data;

  const configuredEmail = process.env.ADMIN_EMAIL || "admin@hyrgpt.com";
  const configuredPassword = process.env.ADMIN_PASSWORD || "Admin@1234";

  if (
    email.toLowerCase().trim() !== configuredEmail.toLowerCase().trim() ||
    password !== configuredPassword
  ) {
    logger.warn("Failed login attempt with incorrect credentials", { clientIp, email });
    return errorResponse("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }

  // Create JWT and store in secure HTTP-only cookie
  const token = await createSessionToken(email);
  await setSessionCookie(token);

  logger.info("Admin login successful", { clientIp, email });

  return successResponse({
    user: {
      email,
      role: "admin",
    },
  });
}
