#!/usr/bin/env node
// PostToolUse hook (matcher: Skill). Records a real skill invocation so the
// Curator ages skills by *use*, not just edits. Fast and silent — touches a
// `.last-used` sidecar in the skill's directory and exits.

import { readFileSync } from "node:fs";
import { recordUse } from "../lib/curator.mjs";

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const name = input?.tool_input?.skill ?? input?.tool_input?.name;
  if (name) recordUse(name);
} catch {
  /* best-effort: never disrupt the turn */
}
process.exit(0);
