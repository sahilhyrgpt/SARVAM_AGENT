import type { NextConfig } from "next";
import { getSecurityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: getSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
