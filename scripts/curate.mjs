#!/usr/bin/env node
// SessionStart hook (the Curator's weekly sweep). Throttled to once per
// MEMORY_CURATOR_INTERVAL_DAYS via a sentinel, so it runs roughly weekly when
// you're active — approximating Hermes' "every 7 days after idle" without a
// daemon. Notify-only unless MEMORY_CURATOR_ARCHIVE=1.

import { dueForRun, markRun, sweep, CONFIG } from "../lib/curator.mjs";

try {
  if (!dueForRun()) process.exit(0);
  const r = sweep();
  markRun(); // record the run even if nothing changed, to hold the throttle

  const names = (xs) => xs.map((x) => x.name).join(", ");
  const lines = [];
  if (r.archived.length) {
    lines.push(
      `Archived ${r.archived.length} skill(s) unused >${CONFIG.archiveDays}d → ~/.claude/skills/.archive/ (reversible): ${names(r.archived)}.`
    );
  }
  if (r.archivable.length) {
    lines.push(
      `${r.archivable.length} skill(s) unused >${CONFIG.archiveDays}d, eligible to archive: ${names(r.archivable)}. Set MEMORY_CURATOR_ARCHIVE=1 to auto-archive, or delete/pin manually.`
    );
  }
  if (r.stale.length) {
    lines.push(`${r.stale.length} skill(s) stale (unused >${CONFIG.staleDays}d): ${names(r.stale)}.`);
  }
  if (!lines.length) process.exit(0);

  const context = ["## Skill curator (weekly sweep)", ...lines.map((l) => `- ${l}`)].join("\n");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
    })
  );
} catch (err) {
  process.stderr.write(`[memory-plugin] curate failed: ${err?.message}\n`);
  process.exit(0);
}
