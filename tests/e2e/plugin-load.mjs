// End-to-end smoke test — proves Claude Code can actually load this plugin
// through the real loading path. Costs ~$0.01 and needs `claude` auth, so it is
// NOT part of `npm test`; run it before a release. Ported from afk's
// tests/e2e/plugin-load.ts.

import { dirname, join } from "node:path";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pluginDir } from "../lib/paths.mjs";
import { TestRun } from "../lib/runner.mjs";

const run = new TestRun();
const logPath = join(mkdtempSync(join(tmpdir(), "mem-smoke-log-")), "raw.jsonl");
const projectDir = mkdtempSync(join(tmpdir(), "mem-smoke-project-"));

function readJsonLines() {
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

try {
  console.log("=== Plugin-load smoke test (1 headless turn, ~$0.01) ===");
  console.log("");

  const result = spawnSync(
    "claude",
    [
      "-p",
      "Reply with the single word: ok",
      "--plugin-dir",
      pluginDir,
      "--setting-sources",
      "project",
      "--max-turns",
      "1",
      "--output-format",
      "stream-json",
      "--verbose",
    ],
    { cwd: projectDir, encoding: "utf8", timeout: 120_000 }
  );
  writeFileSync(logPath, result.stdout ?? "");

  const events = readJsonLines();
  const init = events.find((e) => e.type === "system" && e.subtype === "init");

  if (!init) {
    run.fail("headless run produced a system/init event", (result.stderr || result.stdout || "").slice(-500));
    run.summary();
    process.exit(1);
  }
  run.pass("headless run produced a system/init event");

  const plugins = Array.isArray(init.plugins) ? init.plugins : [];
  run.check(plugins.some((p) => p.name === "memory"), "memory appears in the loaded plugins list", JSON.stringify(init.plugins ?? null));

  const pluginErrors = init.plugin_errors;
  run.check(pluginErrors == null || (Array.isArray(pluginErrors) && pluginErrors.length === 0), "no plugin_errors reported", JSON.stringify(pluginErrors));

  // The MCP server should register too (soft check — only assert if the init
  // event surfaces mcp_servers at all).
  const servers = Array.isArray(init.mcp_servers) ? init.mcp_servers : null;
  if (servers) {
    const mem = servers.find((s) => s.name === "memory");
    run.check(mem && mem.status !== "failed", "memory MCP server registered without failure", JSON.stringify(mem ?? null));
  }

  const resultEvent = events.filter((e) => e.type === "result").at(-1);
  run.check(resultEvent?.is_error === false, "headless run completed without Claude error", String(resultEvent?.result ?? ""));

  const cost = events.find((e) => e.type === "result" && e.total_cost_usd != null)?.total_cost_usd;
  run.summary(cost != null ? [`  (cost: $${cost})`] : []);
  process.exit(run.exitCode());
} finally {
  rmSync(projectDir, { recursive: true, force: true });
  rmSync(dirname(logPath), { recursive: true, force: true });
}
