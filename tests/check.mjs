// Zero-token entrypoint: runs the unit + integration suites in order and exits
// non-zero on the first failure. The model-backed e2e smoke is intentionally
// excluded — run `npm run test:e2e` for that before a release.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

console.log("=== memory-plugin static checks (Node, zero-token) ===");
console.log("");

const scripts = ["./unit/run-unit-tests.mjs", "./integration/run-integration-tests.mjs"];

for (const script of scripts) {
  const result = spawnSync("node", [fileURLToPath(new URL(script, import.meta.url))], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
