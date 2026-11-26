/**
 * Security Headers Configuration for Vercel / Next.js
 *
 * Implements strict CSP, clickjacking prevention (frame-ancestors 'none'),
 * nosniff, strict referrer policy, and HSTS.
 */

export function getSecurityHeaders() {
  const isProd = process.env.NODE_ENV === "production";

  const cspDirectives = [
    "default-src 'self'",
    // Script sources: Allow Next.js inline scripts and self
    `script-src 'self' 'unsafe-inline' ${isProd ? "" : "'unsafe-eval'"} https:`,
    // Style sources: Allow Tailwind/Next.js inline styles and Google fonts
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Font sources
    "font-src 'self' https://fonts.gstatic.com data:",
    // Image sources
    "img-src 'self' data: blob: https:",
    // Media & Audio sources
    "media-src 'self' blob: data: https:",
    // Connect sources (APIs, Next.js dev server, Sarvam)
    "connect-src 'self' https://apps.sarvam.ai https://*.sarvam.ai https:",
    // Prevent frame embedding / clickjacking
    "frame-ancestors 'none'",
    // Restrict object tags
    "object-src 'none'",
    // Base URI restriction
    "base-uri 'self'",
    // Form action restriction
    "form-action 'self'",
  ]
    .filter(Boolean)
    .join("; ");

  return [
    {
      key: "Content-Security-Policy",
      value: cspDirectives,
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
    },
    {
      key: "X-XSS-Protection",
      value: "1; mode=block",
    },
    ...(isProd
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ]
      : []),
  ];
}
