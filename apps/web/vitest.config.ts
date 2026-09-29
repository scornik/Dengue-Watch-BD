import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "../../supabase/functions/_shared/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    server: { deps: { inline: ["zod"] } },
  },
});
