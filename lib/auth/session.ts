import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { ensureEnvLoaded } from "@/lib/utils/env";

export const SESSION_COOKIE_NAME = "admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 hours

function getJwtSecret(): Uint8Array {
  ensureEnvLoaded();
  const secret =
    process.env.JWT_SECRET ||
    process.env.INTERNAL_API_KEY ||
    process.env.ADMIN_PASSWORD ||
    "sarvam-ai-calling-agent-super-secret-key-change-in-production";
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  email: string;
  role: "admin";
  iat?: number;
  exp?: number;
}

export async function createSessionToken(email: string): Promise<string> {
  const secret = getJwtSecret();
  const token = await new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secret);
  return token;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!cookie || !cookie.value) return null;
  return verifySessionToken(cookie.value);
}
