import type { NextConfig } from "next";

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;

export function resolveReleaseBuildId(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const ciReleaseSha = environment.CI_RELEASE_SHA?.trim();
  const releaseSha = environment.RELEASE_SHA?.trim();

  if (ciReleaseSha && releaseSha && ciReleaseSha !== releaseSha) {
    throw new Error(
      "CI_RELEASE_SHA and RELEASE_SHA must identify the same commit",
    );
  }

  const buildId = ciReleaseSha || releaseSha;
  if (!buildId) {
    return null;
  }
  if (!RELEASE_SHA_PATTERN.test(buildId)) {
    throw new Error(
      "The release build ID must be a lowercase 40-character Git SHA",
    );
  }

  return buildId;
}

const nextConfig: NextConfig = {
  generateBuildId: () => resolveReleaseBuildId(process.env),
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Vary",
            value: "Cookie, Authorization",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
        ],
      },
      {
        source: "/register",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store, max-age=0",
          },
          {
            key: "Referrer-Policy",
            value: "no-referrer",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Content-Security-Policy",
            value:
              "base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
