#!/usr/bin/env node
// Stop hook. Hermes runs a self-improvement pass after each turn that mines the
// conversation for durable facts and writes them to memory. Claude Code can't
// run something truly concurrent with the turn, but a Stop hook fires the
// moment the turn ends — so we spawn a detached headless `claude -p` review
// that reads the transcript and saves learnings through the memory MCP tools.
//
// Off by default (it costs tokens). Enable with:  export MEMORY_REVIEW_ENABLED=1
//
// Recursion guard: the review session is itself a Claude run that will trigger
// this same Stop hook when it finishes. We set MEMORY_REVIEW=1 on the child and
// bail immediately if we see it.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function main() {
  if (process.env.MEMORY_REVIEW === "1") process.exit(0); // we're inside a review run
  if (process.env.MEMORY_REVIEW_ENABLED !== "1") process.exit(0); // feature off

  const input = readStdin();
  if (input.stop_hook_active) process.exit(0); // avoid same-session continuation loops
  const transcript = input.transcript_path;
  if (!transcript) process.exit(0);

  const prompt = [
    "You are a memory-curation pass running after a Claude Code turn.",
    `Read the transcript at: ${transcript}`,
    "Extract only DURABLE, reusable facts worth persisting across sessions:",
    "- user preferences / corrections / communication style -> target 'user'",
    "- environment facts, project conventions, tool quirks, completed work -> target 'memory'",
    "Skip ephemera, one-off paths, and anything already obvious from the repo.",
    "Save each via memory_add (or memory_replace to merge with an overlapping entry).",
    "Keep entries compact and information-dense. If a store is full, consolidate first.",
    "Do NOT create or modify skills here. Procedural skills are captured INLINE by the",
    "main agent during normal work — this stale background pass must never write them.",
    "If nothing is worth saving, do nothing.",
  ].join("\n");

  const child = spawn(
    "claude",
    ["-p", prompt, "--permission-mode", "acceptEdits"],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, MEMORY_REVIEW: "1" },
    }
  );
  child.unref();
  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write(`[memory-plugin] review failed: ${err?.message}\n`);
  process.exit(0);
}
