/**
 * Structured Server-Side Logger
 *
 * Sanitizes sensitive credentials, authorization tokens, passwords, and PII.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogMeta {
  requestId?: string;
  route?: string;
  interviewId?: string;
  providerCallId?: string;
  eventType?: string;
  status?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "secret",
  "apikey",
  "api_key",
  "token",
  "jwt",
  "sarvam_api_key",
  "internal_api_key",
]);

function sanitize(obj: unknown, depth = 0): unknown {
  if (depth > 4) return "[Max Depth]";
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase()) || key.toLowerCase().includes("secret") || key.toLowerCase().includes("password")) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitize(val, depth + 1);
    }
  }
  return sanitized;
}

function log(level: LogLevel, message: string, meta: LogMeta = {}) {
  const timestamp = new Date().toISOString();
  const sanitizedMeta = sanitize(meta) as Record<string, unknown>;

  const logPayload = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...sanitizedMeta,
  };

  const formatted = JSON.stringify(logPayload);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "debug":
      if (process.env.NODE_ENV !== "production") {
        console.debug(formatted);
      }
      break;
    case "info":
    default:
      console.log(formatted);
      break;
  }
}

export const logger = {
  info: (message: string, meta?: LogMeta) => log("info", message, meta),
  warn: (message: string, meta?: LogMeta) => log("warn", message, meta),
  error: (message: string, meta?: LogMeta) => log("error", message, meta),
  debug: (message: string, meta?: LogMeta) => log("debug", message, meta),
};
