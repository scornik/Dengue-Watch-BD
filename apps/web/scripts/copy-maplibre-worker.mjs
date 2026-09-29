// Copies MapLibre's worker (+ its shared chunk) to public/maplibre so the
// browser can load it by URL; bundlers don't follow MapLibre's dynamic worker URL.
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist");
mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  cpSync(path.join(dist, f), path.join("public/maplibre", f));
}
console.log("maplibre worker copied");
