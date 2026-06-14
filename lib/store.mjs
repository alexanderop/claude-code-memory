// Shared storage layer for the memory plugin.
// Both the MCP server (writes) and the SessionStart hook (reads) import this
// so the file format, limits, and delimiter live in exactly one place.

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const ROOT = process.env.MEMORY_PLUGIN_DIR || join(homedir(), ".claude", "memory-plugin");

// Entries within a file are separated by a section sign on its own line,
// matching Hermes' `§` delimiter. Entries may themselves be multiline.
export const DELIM = "\n§\n";

export const STORES = {
  memory: {
    file: join(ROOT, "MEMORY.md"),
    label: "MEMORY (your personal notes)",
    limit: Number(process.env.MEMORY_CHAR_LIMIT || 2200),
  },
  user: {
    file: join(ROOT, "USER.md"),
    label: "USER PROFILE",
    limit: Number(process.env.MEMORY_USER_CHAR_LIMIT || 1375),
  },
};

function ensureRoot() {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true });
}

export function readEntries(target) {
  const { file } = STORES[target];
  if (!existsSync(file)) return [];
  const raw = readFileSync(file, "utf8").trim();
  if (!raw) return [];
  return raw
    .split(DELIM)
    .map((e) => e.trim())
    .filter(Boolean);
}

export function writeEntries(target, entries) {
  ensureRoot();
  const { file } = STORES[target];
  writeFileSync(file, entries.join(DELIM) + "\n", "utf8");
}

// Total characters counts only entry content (delimiters are framing, not data) —
// same accounting Hermes shows in its `1,474/2,200 chars` header.
export function usedChars(entries) {
  return entries.reduce((n, e) => n + e.length, 0);
}

// Render a store the way it appears in the system prompt: a fenced header with
// usage percentage, then entries joined by the `§` delimiter.
export function renderStore(target) {
  const { label, limit } = STORES[target];
  const entries = readEntries(target);
  const used = usedChars(entries);
  const pct = Math.round((used / limit) * 100);
  const bar = "═".repeat(46);
  const header = `${bar}\n${label} [${pct}% — ${used.toLocaleString()}/${limit.toLocaleString()} chars]\n${bar}`;
  if (entries.length === 0) return `${header}\n(empty)`;
  return `${header}\n${entries.join("\n§\n")}`;
}
