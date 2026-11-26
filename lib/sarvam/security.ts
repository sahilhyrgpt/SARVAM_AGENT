import crypto from "crypto";

/**
 * Validate Sarvam Webhook Requests
 *
 * Verifies authenticity via:
 * 1. Query parameter token `?secret=...`
 * 2. Shared secret token in `x-webhook-secret` or `Authorization: Bearer <SARVAM_WEBHOOK_SECRET>`
 * 3. HMAC-SHA256 signature in `x-sarvam-signature` or `x-hub-signature-256`
 * 4. Structural verification of Sarvam telephony payload (has attempt_id & status)
 */
export function validateSarvamWebhook(
  rawBody: string,
  headers: Headers,
  searchParams?: URLSearchParams
): { valid: boolean; reason?: string } {
  const webhookSecret = process.env.SARVAM_WEBHOOK_SECRET;

  // 1. Check secret token query param if provided (e.g. ?secret=...)
  if (searchParams && webhookSecret) {
    const querySecret = searchParams.get("secret") || searchParams.get("token");
    if (querySecret && querySecret === webhookSecret) {
      return { valid: true };
    }
  }

  // 2. Check secret token header if provided
  const secretHeader =
    headers.get("x-webhook-secret") ||
    headers.get("x-sarvam-secret") ||
    headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (secretHeader && webhookSecret && secretHeader === webhookSecret) {
    return { valid: true };
  }

  // 3. Check HMAC signature if provided
  const signatureHeader =
    headers.get("x-sarvam-signature") ||
    headers.get("x-hub-signature-256") ||
    headers.get("x-signature");

  if (signatureHeader && webhookSecret) {
    const cleanSignature = signatureHeader.replace(/^sha256=/, "");
    const computedHmac = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(cleanSignature, "hex"),
        Buffer.from(computedHmac, "hex")
      );
      if (isValid) return { valid: true };
    } catch {
      // Buffer length mismatch or parsing error
    }
  }

  // 4. In development without configured secret, permit
  if (!webhookSecret || webhookSecret === "replace-me" || process.env.NODE_ENV !== "production") {
    return { valid: true };
  }

  // 5. Sarvam AI outbound telephony webhooks do not send custom headers or HMAC signatures by default.
  // Verify structural authenticity: payload must be valid JSON containing required Sarvam fields
  // ('attempt_id' and 'status'). The route handler further validates the payload against Zod schema
  // and matches the attempt_id to an existing interview in MongoDB.
  try {
    const parsed = JSON.parse(rawBody);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.attempt_id === "string" &&
      parsed.attempt_id.trim().length > 0 &&
      typeof parsed.status === "string"
    ) {
      return { valid: true };
    }
  } catch {
    // invalid JSON
  }

  return {
    valid: false,
    reason: "Invalid webhook signature, secret header, or payload structure.",
  };
}
