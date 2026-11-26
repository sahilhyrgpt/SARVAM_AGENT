/**
 * Phone Number Utilities
 * Formats and normalizes phone numbers into E.164 format.
 */

export function normalizePhoneNumber(
  phone: string,
  defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || "+91"
): { normalized: string; isValid: boolean } {
  if (!phone) {
    return { normalized: "", isValid: false };
  }

  // Remove any whitespace, dashes, brackets, parentheses
  let cleaned = phone.replace(/[\s\-()[\]]/g, "").trim();

  // If starts with +, verify standard format
  if (cleaned.startsWith("+")) {
    const digitsOnly = cleaned.substring(1);
    const isValid = /^\d{7,15}$/.test(digitsOnly);
    return { normalized: cleaned, isValid };
  }

  // If starts with 00 (international prefix), replace with +
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.substring(2);
    const digitsOnly = cleaned.substring(1);
    const isValid = /^\d{7,15}$/.test(digitsOnly);
    return { normalized: cleaned, isValid };
  }

  // If starts with 0 (national trunk prefix, common in India/UK), strip leading 0
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }

  // Prepend default country code
  const prefix = defaultCountryCode.startsWith("+")
    ? defaultCountryCode
    : `+${defaultCountryCode}`;

  const normalized = `${prefix}${cleaned}`;
  const digitsOnly = normalized.substring(1);
  const isValid = /^\d{7,15}$/.test(digitsOnly);

  return { normalized, isValid };
}
