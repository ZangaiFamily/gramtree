import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/gramtree",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
