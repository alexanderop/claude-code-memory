#!/usr/bin/env node
// UserPromptSubmit hook. Cheap reactive arm of the learning loop: when the
// user's message looks like a correction, nudge the agent to persist the lesson
// *before* it answers — mirroring pi-hermes-memory's correction-detector, but
// using a hook instead of a subprocess (detection is free regex; the actual
// save is done inline by the agent via the memory tools).

import { readFileSync } from "node:fs";
import { isCorrection } from "../lib/correction.mjs";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function main() {
  const input = readStdin();
  const prompt = input.prompt || input.user_prompt || "";
  if (!isCorrection(prompt)) process.exit(0);

  const context = [
    "[memory-plugin] This message looks like a correction. Before continuing, persist the durable lesson:",
    "- Save the corrected preference/fact with memory_add — target 'user' for preferences/style, 'memory' for env/project facts.",
    "- If it contradicts an existing entry, use memory_replace to update it instead of adding a duplicate.",
    "Keep the entry compact, then address the correction.",
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: context,
      },
    })
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`[memory-plugin] correction-detect failed: ${err?.message}\n`);
  process.exit(0);
}
