#!/usr/bin/env node
// Zero-dependency MCP server that owns the two memory files. It speaks the MCP
// stdio transport directly (newline-delimited JSON-RPC 2.0) so the plugin works
// the moment it's copied into ~/.claude/plugins/cache — no `npm install` step.
//
// It exposes the same three actions as Hermes' `memory` tool — add / replace /
// remove — plus a `list` for debugging. The server (not the model) enforces char
// limits, substring matching, dedup, and security scanning.

import { createInterface } from "node:readline";

import {
  STORES,
  readEntries,
  writeEntries,
  usedChars,
} from "../lib/store.mjs";
import { scan } from "../lib/security.mjs";

const SERVER = { name: "memory", version: "0.1.0" };
const PROTOCOL_VERSION = "2024-11-05";

// ---- tool result helpers --------------------------------------------------

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

const isTarget = (t) => t === "memory" || t === "user";
const nonEmpty = (s) => typeof s === "string" && s.trim().length > 0;

// ---- tool definitions -----------------------------------------------------

const TARGET_PROP = {
  type: "string",
  enum: ["memory", "user"],
  description:
    "Which store: 'memory' (agent's notes about env/work) or 'user' (the user's profile/preferences).",
};

const TOOLS = [
  {
    name: "memory_add",
    description:
      "Append a new entry to a memory store. Fails (with consolidation guidance) if it would exceed the store's character limit, and silently no-ops on an exact duplicate. Keep entries compact and information-dense.",
    inputSchema: {
      type: "object",
      properties: { target: TARGET_PROP, content: { type: "string" } },
      required: ["target", "content"],
    },
    handler: ({ target, content }) => {
      if (!isTarget(target)) return fail({ success: false, error: "target must be 'memory' or 'user'." });
      if (!nonEmpty(content)) return fail({ success: false, error: "content must be a non-empty string." });
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
      return ok(`Added to '${target}'. Usage: ${usedChars(entries)}/${limit} chars (${entries.length} entries).`);
    },
  },
  {
    name: "memory_replace",
    description:
      "Replace the single entry containing `old_text` (a short unique substring) with `content`. Bound by the same char limit as add — swapping in a longer entry can still overflow.",
    inputSchema: {
      type: "object",
      properties: {
        target: TARGET_PROP,
        old_text: { type: "string", description: "A short substring that uniquely identifies one entry." },
        content: { type: "string" },
      },
      required: ["target", "old_text", "content"],
    },
    handler: ({ target, old_text, content }) => {
      if (!isTarget(target)) return fail({ success: false, error: "target must be 'memory' or 'user'." });
      if (!nonEmpty(old_text) || !nonEmpty(content))
        return fail({ success: false, error: "old_text and content must be non-empty strings." });
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
    },
  },
  {
    name: "memory_remove",
    description: "Remove the single entry containing `old_text` (a short unique substring).",
    inputSchema: {
      type: "object",
      properties: {
        target: TARGET_PROP,
        old_text: { type: "string", description: "A short substring that uniquely identifies one entry." },
      },
      required: ["target", "old_text"],
    },
    handler: ({ target, old_text }) => {
      if (!isTarget(target)) return fail({ success: false, error: "target must be 'memory' or 'user'." });
      if (!nonEmpty(old_text)) return fail({ success: false, error: "old_text must be a non-empty string." });
      const { limit } = STORES[target];
      const entries = readEntries(target);
      const m = matchOne(entries, old_text);
      if (m.error) return fail({ success: false, error: m.error, matches: m.matches });

      const [removed] = entries.splice(m.index, 1);
      writeEntries(target, entries);
      return ok(
        `Removed 1 entry from '${target}'. Usage: ${usedChars(entries)}/${limit} chars (${entries.length} entries).\nRemoved: ${removed.slice(0, 80)}${removed.length > 80 ? "…" : ""}`
      );
    },
  },
  {
    name: "memory_list",
    description:
      "List the raw entries of a store with their usage. Normally unnecessary — memory is injected into context at session start — but useful for debugging or before a consolidation pass.",
    inputSchema: {
      type: "object",
      properties: { target: TARGET_PROP },
      required: ["target"],
    },
    handler: ({ target }) => {
      if (!isTarget(target)) return fail({ success: false, error: "target must be 'memory' or 'user'." });
      const { limit } = STORES[target];
      const entries = readEntries(target);
      return ok(JSON.stringify({ target, usage: `${usedChars(entries)}/${limit}`, entries }, null, 2));
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// ---- JSON-RPC stdio loop --------------------------------------------------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize":
        return send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER,
          },
        });
      case "notifications/initialized":
        return; // notification, no response
      case "ping":
        return send({ jsonrpc: "2.0", id, result: {} });
      case "tools/list":
        return send({
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
          },
        });
      case "tools/call": {
        const tool = TOOL_BY_NAME.get(params?.name);
        if (!tool) {
          return send({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
        }
        const result = tool.handler(params.arguments || {});
        return send({ jsonrpc: "2.0", id, result });
      }
      default:
        if (isNotification) return;
        return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    if (isNotification) return;
    send({ jsonrpc: "2.0", id, error: { code: -32603, message: `Internal error: ${err?.message}` } });
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return; // ignore unparseable lines
  }
  handle(msg);
});
