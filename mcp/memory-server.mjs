#!/usr/bin/env node
// MCP server that owns the two memory files. It exposes the same three actions
// as Hermes' `memory` tool — add / replace / remove — plus a `list` for
// debugging. The server (not the model) enforces char limits, substring
// matching, dedup, and security scanning, so the contract is identical no
// matter which client is driving it.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  STORES,
  readEntries,
  writeEntries,
  usedChars,
} from "../lib/store.mjs";
import { scan } from "../lib/security.mjs";

const targetSchema = z
  .enum(["memory", "user"])
  .describe("Which store: 'memory' (agent's notes about env/work) or 'user' (the user's profile/preferences).");

const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (obj) => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
});

// Find exactly one entry containing `needle`. Returns {index} or an error shape
// describing why the match was ambiguous / missing — same UX as Hermes.
function matchOne(entries, needle) {
  const hits = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.includes(needle));
  if (hits.length === 0) return { error: `No entry contains the substring "${needle}".` };
  if (hits.length > 1) {
    return {
      error: `Substring "${needle}" matched ${hits.length} entries. Use a longer, unique substring.`,
      matches: hits.map(({ e }) => e),
    };
  }
  return { index: hits[0].i };
}

const server = new McpServer({ name: "memory", version: "0.1.0" });

server.registerTool(
  "memory_add",
  {
    title: "Add a memory entry",
    description:
      "Append a new entry to a memory store. Fails (with consolidation guidance) if it would exceed the store's character limit, and silently no-ops on an exact duplicate. Keep entries compact and information-dense.",
    inputSchema: { target: targetSchema, content: z.string().min(1) },
  },
  async ({ target, content }) => {
    content = content.trim();
    const sec = scan(content);
    if (!sec.ok) return fail({ success: false, error: sec.reason });

    const { limit } = STORES[target];
    const entries = readEntries(target);

    if (entries.some((e) => e === content)) {
      return ok(`No duplicate added — that entry already exists in '${target}'.`);
    }

    const used = usedChars(entries);
    if (used + content.length > limit) {
      return fail({
        success: false,
        error: `Memory at ${used}/${limit} chars. Adding this entry (${content.length} chars) would exceed the limit. Consolidate now: use 'memory_replace' to merge overlapping entries into shorter ones, or 'memory_remove' to drop stale/less-important entries (see current_entries), then retry this add — all in this turn.`,
        current_entries: entries,
        usage: `${used}/${limit}`,
      });
    }

    entries.push(content);
    writeEntries(target, entries);
    const after = usedChars(entries);
    return ok(`Added to '${target}'. Usage: ${after}/${limit} chars (${entries.length} entries).`);
  }
);

server.registerTool(
  "memory_replace",
  {
    title: "Replace a memory entry",
    description:
      "Replace the single entry containing `old_text` (a short unique substring) with `content`. Bound by the same char limit as add — swapping in a longer entry can still overflow.",
    inputSchema: {
      target: targetSchema,
      old_text: z.string().min(1).describe("A short substring that uniquely identifies one entry."),
      content: z.string().min(1),
    },
  },
  async ({ target, old_text, content }) => {
    content = content.trim();
    const sec = scan(content);
    if (!sec.ok) return fail({ success: false, error: sec.reason });

    const { limit } = STORES[target];
    const entries = readEntries(target);
    const m = matchOne(entries, old_text);
    if (m.error) return fail({ success: false, error: m.error, matches: m.matches });

    const projected = usedChars(entries) - entries[m.index].length + content.length;
    if (projected > limit) {
      return fail({
        success: false,
        error: `Replacement would put memory at ${projected}/${limit} chars. Shorten the new content or remove another entry first, then retry.`,
        current_entries: entries,
        usage: `${usedChars(entries)}/${limit}`,
      });
    }

    entries[m.index] = content;
    writeEntries(target, entries);
    return ok(`Replaced 1 entry in '${target}'. Usage: ${usedChars(entries)}/${limit} chars.`);
  }
);

server.registerTool(
  "memory_remove",
  {
    title: "Remove a memory entry",
    description: "Remove the single entry containing `old_text` (a short unique substring).",
    inputSchema: {
      target: targetSchema,
      old_text: z.string().min(1).describe("A short substring that uniquely identifies one entry."),
    },
  },
  async ({ target, old_text }) => {
    const { limit } = STORES[target];
    const entries = readEntries(target);
    const m = matchOne(entries, old_text);
    if (m.error) return fail({ success: false, error: m.error, matches: m.matches });

    const [removed] = entries.splice(m.index, 1);
    writeEntries(target, entries);
    return ok(
      `Removed 1 entry from '${target}'. Usage: ${usedChars(entries)}/${limit} chars (${entries.length} entries).\nRemoved: ${removed.slice(0, 80)}${removed.length > 80 ? "…" : ""}`
    );
  }
);

server.registerTool(
  "memory_list",
  {
    title: "List memory entries",
    description:
      "List the raw entries of a store with their usage. Normally unnecessary — memory is injected into context at session start — but useful for debugging or before a consolidation pass.",
    inputSchema: { target: targetSchema },
  },
  async ({ target }) => {
    const { limit } = STORES[target];
    const entries = readEntries(target);
    return ok(
      JSON.stringify({ target, usage: `${usedChars(entries)}/${limit}`, entries }, null, 2)
    );
  }
);

await server.connect(new StdioServerTransport());
