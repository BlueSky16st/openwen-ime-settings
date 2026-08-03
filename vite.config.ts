import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: ".openwen-build/frontend"
  },
  test: {
    environment: "jsdom"
  },
  server: {
    port: 1420,
    strictPort: true
  },
  clearScreen: false
});
