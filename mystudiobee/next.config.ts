import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // @sparticuz/chromium's binary/binding files are loaded via a dynamic path
  // (chromium.executablePath()) rather than a plain require(), so Vercel's
  // static file-tracing misses them and the deployed function is missing
  // node_modules/@sparticuz/chromium/bin entirely at runtime. Force-include it.
  outputFileTracingIncludes: {
    "/api/generate-pdf": ["./node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;
