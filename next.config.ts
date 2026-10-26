import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every screen is per-user and dynamic (RLS data), so Cache Components / PPR are off. See docs/DECISIONS.md.
  experimental: {
    // The `radix-ui` umbrella re-exports ~30 primitive packages; without this, dev compiles all of them on first use.
    // (lucide-react, date-fns and recharts are already optimized by default.)
    optimizePackageImports: ["radix-ui"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
