import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://sdk.scdn.co",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.scdn.co https://*.spotifycdn.com",
  "font-src 'self'",
  "connect-src 'self' https://accounts.spotify.com https://api.spotify.com https://*.spotify.com wss://*.spotify.com https://*.scdn.co wss://*.scdn.co",
  "media-src 'self' blob: https://*.scdn.co https://*.spotifycdn.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
    ];
  },
};

export default nextConfig;
