import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a minimal, self-contained server bundle for Docker / Railway.
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true,
};

export default nextConfig;
