import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    output: "export",
    basePath: isDev ? undefined : "/gramtree",
    images: {
      unoptimized: true,
    },
  };
};

export default nextConfig;
