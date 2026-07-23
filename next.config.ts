import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The scripture corpus and trademark blocklist are read from disk at
  // runtime; make sure serverless bundles include them.
  outputFileTracingIncludes: {
    "/**": ["./data/**"],
  },
};

export default nextConfig;
