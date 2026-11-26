import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";

export interface AuthResult {
  authenticated: boolean;
  type?: "session" | "api_key";
  error?: string;
}

/**
 * Validate internal API key from Bearer token or x-api-key header
 */
export function validateApiKey(req: Request | NextRequest): boolean {
  const configuredKey = process.env.INTERNAL_API_KEY;
  if (!configuredKey) return false;

  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      if (parts[1].trim() === configuredKey) return true;
    }
  }

  const xApiKey = req.headers.get("x-api-key");
  if (xApiKey && xApiKey.trim() === configuredKey) return true;

  return false;
}

/**
 * Guard that allows either a valid browser admin session OR a valid INTERNAL_API_KEY
 */
export async function requireApiKeyOrSession(req: Request | NextRequest): Promise<AuthResult> {
  // 1. Check API Key first (Postman / automated scripts)
  if (validateApiKey(req)) {
    return { authenticated: true, type: "api_key" };
  }

  // 2. Check Session Cookie (Browser dashboard UI)
  const session = await getSession();
  if (session && session.role === "admin") {
    return { authenticated: true, type: "session" };
  }

  return {
    authenticated: false,
    error: "Unauthorized: Valid admin session cookie or Bearer INTERNAL_API_KEY is required.",
  };
}

/**
 * Guard that strictly requires INTERNAL_API_KEY
 */
export function requireApiKey(req: Request | NextRequest): AuthResult {
  if (validateApiKey(req)) {
    return { authenticated: true, type: "api_key" };
  }
  return {
    authenticated: false,
    error: "Unauthorized: Valid Bearer INTERNAL_API_KEY is required.",
  };
}

/**
 * Guard specifically for Sarvam Context Tool endpoint
 * Verifies Authorization: Bearer <SARVAM_CONTEXT_SECRET>
 */
export function requireSarvamContextSecret(req: Request | NextRequest): AuthResult {
  const secret = process.env.SARVAM_CONTEXT_SECRET;
  if (!secret) {
    // In local dev without secret configured, allow if matching internal key or warning
    const internalKey = process.env.INTERNAL_API_KEY;
    if (internalKey && validateApiKey(req)) {
      return { authenticated: true, type: "api_key" };
    }
    // If neither is configured in local dev, permit with warning
    if (process.env.NODE_ENV !== "production") {
      return { authenticated: true, type: "api_key" };
    }
    return { authenticated: false, error: "SARVAM_CONTEXT_SECRET not configured on server" };
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      if (parts[1].trim() === secret) return { authenticated: true, type: "api_key" };
    }
  }

  return {
    authenticated: false,
    error: "Unauthorized: Valid Bearer SARVAM_CONTEXT_SECRET is required.",
  };
}
