import type { NextConfig } from "next";

// The dev server only serves its scripts to localhost (and its subdomains) unless told otherwise. When.env points
// APP_BASE_DOMAIN at a LAN name for phone testing (e.g. 192.168.0.173.sslip.io:3000), allow that name and its subdomains.
const baseHost = process.env.APP_BASE_DOMAIN?.split(":")[0];
const devOrigins = baseHost && baseHost !== "localhost" ? [baseHost, `*.${baseHost}`] : [];

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  // E2E uses its own build directory so it can run alongside `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Don't announce the framework in every response.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
