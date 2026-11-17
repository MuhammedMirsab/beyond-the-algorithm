import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Installed MediaPipe runtime version, used to cache-bust the self-hosted wasm and models. */
const mediapipeVersion = (() => {
  try {
    const pkg = join(process.cwd(), "node_modules", "@mediapipe", "tasks-vision", "package.json");
    return (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
  } catch {
    return "0";
  }
})();

const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_MEDIAPIPE_VERSION: mediapipeVersion,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      // ~40 MB of runtime + models, always requested with ?v=<version>: cache forever.
      { source: "/mediapipe/:path*", headers: immutable },
      { source: "/models/:path*", headers: immutable },
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), fullscreen=(self)",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
