import { clearSessionCookie } from "@/lib/auth/session";
import { successResponse } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  return successResponse({ message: "Logged out successfully" });
}
