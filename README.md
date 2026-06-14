# memory-plugin

Hermes-style bounded, curated **persistent memory** for Claude Code.

Two files persist across sessions and are injected into context at session start:

| File (`~/.claude/memory-plugin/`) | Purpose | Limit |
| --- | --- | --- |
| `MEMORY.md` | Agent notes — environment, conventions, completed work | 2,200 chars |
| `USER.md` | User profile — preferences, style, habits | 1,375 chars |

## How it maps to Claude Code

| Hermes feature | Here |
| --- | --- |
| Inject memory at session start (frozen snapshot) | `SessionStart` hook → `additionalContext` (`scripts/inject-memory.mjs`) |
| `memory` tool: add / replace / remove | MCP server `mcp/memory-server.mjs` → `memory_add` / `memory_replace` / `memory_remove` (+ `memory_list`) |
| Char limits + "memory full" error | Enforced in the MCP server |
| Substring matching for replace/remove | `matchOne()` — short unique substring, errors if ambiguous |
| Duplicate prevention | Exact-match no-op on add |
| Security scanning | `lib/security.mjs` — injection/exfil/backdoor patterns + invisible Unicode |
| Background self-improvement review | `Stop` hook → detached `claude -p` review (`scripts/review.mjs`, opt-in) |

The model decides *what* to save via `skills/memory/SKILL.md`; the server enforces *how*.

## Install

```bash
cd ~/Projects/memory-plugin && npm install
```

Then add it as a plugin. Either point a marketplace at the parent dir, or for a
quick local install reference it from your settings. Verify with `/plugin` and
`/mcp` (you should see the `memory` server and its `memory_*` tools).

## Background review (optional)

Off by default — it spawns a headless `claude -p` after each turn and costs tokens.
Enable by exporting `MEMORY_REVIEW_ENABLED=1` in the environment Claude Code runs in.
It is recursion-guarded (`MEMORY_REVIEW=1` on the child) and never blocks the turn.

## Config (env vars)

| Var | Default | Effect |
| --- | --- | --- |
| `MEMORY_PLUGIN_DIR` | `~/.claude/memory-plugin` | Where the two files live |
| `MEMORY_CHAR_LIMIT` | `2200` | `MEMORY.md` limit |
| `MEMORY_USER_CHAR_LIMIT` | `1375` | `USER.md` limit |
| `MEMORY_REVIEW_ENABLED` | unset | `1` enables the Stop-hook review |

## Not included (vs Hermes)

- **Write-approval gating** — add a `PreToolUse` hook matching `mcp__memory__memory_*`
  that returns `{"permissionDecision":"ask"}` (or stages to a pending file).
- **Session search** — Claude Code already ships a `conversation-search` skill over
  `~/.claude/projects/*/*.jsonl`; no FTS5 server needed.
