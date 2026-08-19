/**
 * Security headers.
 *
 * Everything this app loads it serves itself — fonts are self-hosted, there is
 * no CDN and no analytics — so the policy can be tight. The two exceptions are
 * inline styles/scripts, which Next.js emits for hydration, and data: images,
 * which is how the public-screen QR code is drawn.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  /* The moderator screen must never be framed — a hidden frame plus a stolen
   * session cookie is the whole attack. */
  "frame-ancestors 'none'"
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }
];

import fs from 'node:fs';

/* The engine is generated from lib/engine/*.gs by the prebuild step. Without
 * this check a direct `next build` fails with a dozen "module not found" lines
 * that say nothing about the real cause. */
if (!fs.existsSync(new URL('./lib/engine.generated.js', import.meta.url))) {
  throw new Error(
    'ยังไม่ได้สร้าง lib/engine.generated.js — ใช้ "npm run build" หรือ "npm run dev" ' +
    '(หรือรัน "npm run build:engine" ก่อน) อย่าเรียก next build ตรง ๆ');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  }
};

export default nextConfig;
