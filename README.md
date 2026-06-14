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
| Background self-improvement review (memory only) | `Stop` hook → detached `claude -p` review (`scripts/review.mjs`, opt-in) |
| Correction detector | `UserPromptSubmit` hook → regex (`lib/correction.mjs`, `scripts/detect-correction.mjs`) |
| Skill capture (procedural memory) | Always-on policy injected at session start — agent writes `SKILL.md` **inline** |

The model decides *what* to save via `skills/memory/SKILL.md`; the server enforces *how*.

## Three learning loops

Modeled on the real [`pi-hermes-memory`](https://github.com/chandra447/pi-hermes-memory)
implementation (which splits learning into separate loops on purpose):

1. **Background review (memory)** — `Stop` hook fires a detached `claude -p` that mines
   the finished turn for durable facts/preferences/corrections and saves them via the
   memory tools. **It is explicitly forbidden from writing skills** — a stale subprocess
   with only a transcript snapshot would author bad procedures. Opt-in (token cost).
2. **Correction detector** — `UserPromptSubmit` hook runs a free, two-pass regex over each
   prompt (strong patterns always fire; weak patterns need a following directive word;
   negative patterns suppress). On a hit it nudges the agent to persist the lesson *before*
   answering. Detection is pure regex — no LLM call.
3. **Skill capture (procedural)** — done **inline by the main agent**, never in a subprocess.
   The session-start policy tells it to write a structured `SKILL.md`
   (`## When to Use / ## Procedure / ## Pitfalls / ## Verification`) to `~/.claude/skills/`
   (portable) or `.claude/skills/` (repo-specific) the moment it finishes a complex,
   reusable workflow — while it still has full context. Claude Code's native skill
   discovery then handles progressive disclosure.

## Install (as a Claude Code plugin)

This repo is also a single-plugin **marketplace** (`.claude-plugin/marketplace.json`),
so installation is two slash commands inside Claude Code. There is **no build or
`npm install` step** — the MCP server is zero-dependency.

```text
/plugin marketplace add alexanderop/claude-code-memory
/plugin install memory@memory
```

- `marketplace add <owner>/<repo>` registers this GitHub repo as a marketplace.
- `install <plugin>@<marketplace>` — both are named `memory` here (plugin name
  `memory`, marketplace name `memory`).

Claude Code copies the plugin into `~/.claude/plugins/cache` and resolves
`${CLAUDE_PLUGIN_ROOT}` automatically, so the bundled MCP server and hooks just
work. They activate on the next turn — run `/reload-plugins` to pick them up
without restarting. Verify with `/plugin` (shows `memory` enabled) and `/mcp`
(shows the `memory` server with its `memory_*` tools).

### Non-interactive / team install

Declare it in `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "extraKnownMarketplaces": {
    "memory": { "source": { "source": "github", "repo": "alexanderop/claude-code-memory" } }
  },
  "enabledPlugins": { "memory@memory": true }
}
```

### Local development

Point the marketplace at a local checkout instead of GitHub:

```text
/plugin marketplace add ~/Projects/memory-plugin
/plugin install memory@memory
```

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
