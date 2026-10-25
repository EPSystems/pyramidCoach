import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every screen is per-user and dynamic (RLS data), so Cache Components / PPR are off. See docs/DECISIONS.md.
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
