# Changelog

## 0.2.0

Three-loop learning model, informed by reading the real
[`pi-hermes-memory`](https://github.com/chandra447/pi-hermes-memory) source.

- **Inline skill capture** — an always-on session-start policy tells the main
  agent to write a structured `SKILL.md` the moment it finishes a complex,
  reusable workflow (`~/.claude/skills/` portable, `.claude/skills/` repo).
- **Memory-only background review** — the `Stop`-hook `claude -p` review is now
  explicitly forbidden from writing skills; a stale subprocess produces bad
  procedures. Memory/corrections only.
- **Correction detector** — a `UserPromptSubmit` hook runs a free two-pass regex
  (`lib/correction.mjs`) over each prompt and nudges the agent to persist the
  lesson before answering. No LLM call to detect.

## 0.1.0

- MCP server (`memory_add` / `memory_replace` / `memory_remove` / `memory_list`)
  with char-limit enforcement, substring matching, dedup, and security scanning.
- `SessionStart` hook injects memory as a frozen snapshot.
- Zero runtime dependencies; installable as a Claude Code plugin via the bundled
  marketplace manifest.
