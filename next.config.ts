import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // bibliotecas de XML/criptografia e o driver do Postgres rodam só no servidor, sem bundling
  serverExternalPackages: ["xml-crypto", "node-forge", "postgres", "pdf-lib", "qrcode"],
  cacheComponents: true,
  partialPrefetching: true,
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
