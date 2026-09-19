import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "yahoo-finance2"],
  // Pin the workspace root; a stray lockfile in the home directory otherwise
  // makes Turbopack infer a root above the project.
  turbopack: { root: import.meta.dirname },
  // This repo documents itself in README.md; the generated agent files are noise.
  agentRules: false,
  // Snapshots, the model cache and the cost ledger are all read at runtime via
  // process.cwd(), which Next's dependency tracing cannot follow. Without this
  // they are left out of the serverless bundle and every page reports "no data
  // ingested" while Tune shows no model usage.
  outputFileTracingIncludes: {
    "/**": ["./data/snapshot/**", "./data/llm-cache/**", "./data/llm-ledger.json"],
  },
};

export default nextConfig;
