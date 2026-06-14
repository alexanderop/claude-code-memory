#!/usr/bin/env node
// SessionStart hook. Reads both memory stores and injects them into the
// session as `additionalContext`. Claude Code captures this once at session
// start and never mutates it mid-session, which gives us Hermes' "frozen
// snapshot" property for free — the prefix cache stays warm, and any writes a
// tool makes during the session only surface on the *next* start.

import { renderStore, readEntries } from "../lib/store.mjs";

function main() {
  const hasAny = readEntries("memory").length || readEntries("user").length;
  if (!hasAny) process.exit(0); // nothing to inject yet

  const block = [
    "The following is your persistent memory, loaded from disk at session start.",
    "It is a frozen snapshot: manage it with the memory_add / memory_replace / memory_remove tools;",
    "changes apply immediately on disk but only appear here next session.",
    "",
    renderStore("memory"),
    "",
    renderStore("user"),
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: block,
      },
    })
  );
}

try {
  main();
} catch (err) {
  // A failed memory read must never block the session from starting.
  process.stderr.write(`[memory-plugin] inject failed: ${err?.message}\n`);
  process.exit(0);
}
