#!/usr/bin/env node
// SessionStart hook. Two jobs:
//   1. Always inject the memory + skill-capture POLICY — the always-present
//      surface that tells the *main* agent when to save memory and, crucially,
//      to capture reusable procedures as skills INLINE (with full task context),
//      never deferred to the background review. This mirrors how pi keeps its
//      skill-tool description permanently in the system prompt.
//   2. If memory exists, append it as a frozen snapshot. Claude Code captures
//      additionalContext once at session start and never mutates it mid-session,
//      so the prefix cache stays warm; tool writes surface next session.

import { renderStore, readEntries } from "../lib/store.mjs";

const POLICY = [
  "## Persistent memory & skill capture",
  "You have memory that persists across sessions (memory_add / memory_replace / memory_remove) and you can author durable skills.",
  "- As you learn durable user preferences, corrections, environment facts, or project conventions, save them with the memory tools (see the `memory` skill for what/when to save).",
  "- After completing a COMPLEX, reusable procedure — multi-step, required trial-and-error, or a workflow the user taught you — capture it INLINE as a skill *now*, while you still have full context. Never defer skill creation to a background pass (a stale subprocess writes bad skills).",
  "  Write `~/.claude/skills/<slug>/SKILL.md` for portable procedures, or `.claude/skills/<slug>/SKILL.md` for this repo. Include YAML frontmatter (`name`, `description`) and the sections `## When to Use`, `## Procedure`, `## Pitfalls`, `## Verification`.",
  "  Skip one-off task state, generic summaries, and overly narrow notes that would create noisy future matches.",
];

function main() {
  const blocks = [POLICY.join("\n")];

  if (readEntries("memory").length || readEntries("user").length) {
    blocks.push(
      "",
      "Your memory below is a frozen snapshot — tool writes apply on disk immediately but only appear here next session. Trust tool responses for live state.",
      "",
      renderStore("memory"),
      "",
      renderStore("user")
    );
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: blocks.join("\n"),
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
