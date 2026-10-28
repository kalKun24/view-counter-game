import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { resolveApiTarget } from "./api-target.ts";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: resolveApiTarget(process.env.API_PROXY_TARGET),
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
