import { createHmac } from "crypto";

const SECRET = process.env.COOKIE_SECRET || process.env.MENTRAOS_API_KEY || "fallback-secret";

// Token expires after 7 days
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Generate a signed token for a download URL.
 * Format: {expiresAt_hex}.{hmac_hex}
 */
export function generateDownloadToken(resourceId: string): string {
  const expiresAt = Date.now() + EXPIRY_MS;
  const payload = `${resourceId}:${expiresAt}`;
  const hmac = createHmac("sha256", SECRET).update(payload).digest("hex");
  return `${expiresAt.toString(16)}.${hmac}`;
}

/**
 * Verify a signed download token.
 * Returns true if valid and not expired.
 */
export function verifyDownloadToken(resourceId: string, token: string): boolean {
  try {
    const [expiresHex, hmac] = token.split(".");
    if (!expiresHex || !hmac) return false;

    const expiresAt = parseInt(expiresHex, 16);
    if (Date.now() > expiresAt) return false;

    const payload = `${resourceId}:${expiresAt}`;
    const expected = createHmac("sha256", SECRET).update(payload).digest("hex");
    return hmac === expected;
  } catch {
    return false;
  }
}
