/**
 * Rate Limiting Abstraction
 *
 * Provides in-memory sliding window rate limiting for development.
 * Designed with a clean interface for swapping with Upstash Redis (@upstash/ratelimit)
 * when deployed across stateless Vercel Serverless Functions in production.
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// Memory store preserved across hot-reloads
declare global {
  // eslint-disable-next-line no-var
  var __RATE_LIMIT_STORE__: Map<string, RateLimitRecord> | undefined;
}

if (!globalThis.__RATE_LIMIT_STORE__) {
  globalThis.__RATE_LIMIT_STORE__ = new Map<string, RateLimitRecord>();
}

export interface RateLimitOptions {
  intervalSeconds: number;
  maxRequests: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
}

export async function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { intervalSeconds: 60, maxRequests: 20 }
): Promise<RateLimitResult> {
  const store = globalThis.__RATE_LIMIT_STORE__!;
  const now = Date.now();
  const resetIntervalMs = options.intervalSeconds * 1000;

  let record = store.get(identifier);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + resetIntervalMs,
    };
    store.set(identifier, record);
    return {
      success: true,
      limit: options.maxRequests,
      remaining: options.maxRequests - 1,
      reset: Math.ceil(record.resetTime / 1000),
    };
  }

  record.count++;
  store.set(identifier, record);

  const remaining = Math.max(0, options.maxRequests - record.count);
  const success = record.count <= options.maxRequests;

  return {
    success,
    limit: options.maxRequests,
    remaining,
    reset: Math.ceil(record.resetTime / 1000),
  };
}

/**
 * Helper to extract IP or caller identifier from Request
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}
