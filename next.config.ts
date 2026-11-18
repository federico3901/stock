import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `postgres` usa moduli nativi di Node: non va impacchettato
  serverExternalPackages: ["postgres"],
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
