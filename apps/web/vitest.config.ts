import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Edge Function sources import bare "zod" via their Deno import map.
      zod: path.dirname(require.resolve("zod/package.json")),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "../../supabase/functions/_shared/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    server: { deps: { inline: ["zod"] } },
  },
});
