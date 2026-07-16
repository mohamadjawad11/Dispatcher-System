import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws unless a bundler applies the `react-server`
      // resolve condition (Next's webpack config does this; plain Node/Vitest
      // does not). Point it at the package's own no-op stub for tests.
      "server-only": path.resolve(
        __dirname,
        "./node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
  },
});
