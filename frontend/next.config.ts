import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security/headers";

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/tbcall/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; sandbox" }] },
    ];
  },
};
export default config;
