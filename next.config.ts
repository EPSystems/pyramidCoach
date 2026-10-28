import type { NextConfig } from "next";

// Versions the service worker's caches (public/sw.js?v=…): a new deploy installs fresh caches and drops the old ones.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.VERCEL_DEPLOYMENT_ID || String(Date.now());

const nextConfig: NextConfig = {
  /* config options here */
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  // Offline support uses our own service worker + IndexedDB set queue, not `experimental.useOffline` (DECISIONS 95–41):
  // that flag keeps a failed Server Action pending in memory, which is lost if the PWA is closed before signal returns.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
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
