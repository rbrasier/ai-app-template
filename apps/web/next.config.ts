import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: [
    "@template/domain",
    "@template/application",
    "@template/adapters",
    "@template/shared",
  ],
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "@opentelemetry/sdk-node",
    "@opentelemetry/instrumentation-http",
    "@opentelemetry/instrumentation-express",
    "@opentelemetry/instrumentation-pg",
  ],
};

export default config;
