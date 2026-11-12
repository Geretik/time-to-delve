import type { NextConfig } from "next";

// No script-src: Next's inline scripts would need a nonce on every request, which static
// prerendering can't provide. These directives cost nothing and block framing, <base>
// hijacking, form posts to other sites and plugins.
const csp = "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// Pages opened from an e-mail link carry a one-time token in the URL.
const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/obnova-hesla", headers: noReferrer },
      { source: "/registrace", headers: noReferrer },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
