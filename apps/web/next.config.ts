import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  transpilePackages: [
    "@template/domain",
    "@template/application",
    "@template/adapters",
    "@template/shared",
  ],
};

export default config;
