/** Private R2 storage URL prefix (used internally by S3 client) */
export const R2_PRIVATE_URL_PREFIX =
  "https://3c764e987404b8a1199ce5fdc3544a94.r2.cloudflarestorage.com/mentra-notes/";

/** Public R2 CDN URL prefix (accessible from browsers and email clients) */
export const R2_PUBLIC_URL_PREFIX =
  "https://pub-b5f134142a0f4fbdb5c05a2f75fc8624.r2.dev/";

/** Rewrite private R2 URLs to public CDN URLs */
export function rewriteR2Urls(content: string): string {
  return content.replaceAll(R2_PRIVATE_URL_PREFIX, R2_PUBLIC_URL_PREFIX);
}
