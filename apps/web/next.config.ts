import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ar/shared"],
  eslint: { ignoreDuringBuilds: true },
  // Lets a verification build run beside a live `next dev` (NEXT_DIST_DIR=.next-check pnpm build).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
