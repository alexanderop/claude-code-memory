# Changelog

## 0.3.1

- **Test suite** — layered, zero-dependency Node harness ported from the afk
  plugin's strategy (`docs/testing-strategy.md`). Unit tests exercise the
  `store` / `security` / `correction` / `curator` modules and manifests against
  temp dirs; integration tests check version consistency across the three
  manifests, hook wiring, the MCP path, markdown links, and a real MCP stdio
  round-trip; `test:e2e` loads the plugin via `claude --plugin-dir`. Run with
  `npm test` (zero token).
- **Security fix surfaced by the new tests** — the secret-key scanner now catches
  the canonical `AWS_SECRET_ACCESS_KEY` (and other multi-segment `*_KEY` names),
  which the previous `(SECRET|ACCESS|API)?_?KEY` pattern let through.

## 0.3.0

The Curator — Hermes' `active → stale (30d) → archived (90d)` skill lifecycle.

- **Use tracking** — a `PostToolUse` hook on the `Skill` tool records real
  invocations into a `.last-used` sidecar; "last used" is
  `max(.last-used, SKILL.md mtime, dir mtime)` so used-but-unedited skills aren't
  falsely aged out (`lib/curator.mjs`, `scripts/track-skill-use.mjs`).
- **Weekly sweep** — a throttled `SessionStart` hook reports stale/archivable
  skills in context (`scripts/curate.mjs`).
- **Safe by default** — notify-only; archiving requires `MEMORY_CURATOR_ARCHIVE=1`,
  respects `pinned: true`, and *moves* (never deletes) into
  `~/.claude/skills/.archive/`. Thresholds/interval configurable via env.

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
