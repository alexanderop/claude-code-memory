# Testing Strategy

This plugin ships *code* — a zero-dependency MCP server, four logic modules
(`store`, `security`, `correction`, `curator`), five hook scripts, and a skill —
plus the manifests that register all of it with Claude Code. The test strategy is
layered by cost and confidence, the same shape as the [afk
plugin](https://github.com/alexanderop) but adapted to a logic-bearing plugin:

1. **Unit** tests validate one module or one deterministic rule, with no model calls.
2. **Integration** tests validate relationships *between* files and modules.
3. **End-to-end** tests validate that Claude Code can actually load the plugin.

Run the cheap checks on every edit. Run the model-backed check only before a
release or when plugin registration may have changed.

Everything runs on plain **Node** with **zero dev dependencies** — no Bun, no
TypeScript, no `npm install`. That is deliberate: the plugin's whole premise is
that it runs from the plugin cache with nothing installed, and its tests hold to
the same bar.

Local zero-token entrypoint:

```bash
npm test          # unit + integration, ~1s, no network, no tokens
```

## Test categories

| Category | Scope | Cost | Command | Purpose |
|----------|-------|------|---------|---------|
| Unit | One module or one deterministic rule | Zero token | `npm run test:unit` | Catch malformed manifests, bad skill frontmatter, and regressions in the store / security / correction / curator logic. |
| Integration | Relationships across files and modules | Zero token | `npm run test:integration` | Catch version drift across the three manifests, hooks that point at missing scripts, an MCP path that doesn't exist, dead markdown links, and a server that no longer speaks the protocol. |
| End-to-end | Claude Code loading the plugin | Model-backed | `npm run test:e2e` | Catch failures Claude Code reports only at load time: plugin registration errors, MCP server boot failures. |

## Unit checks

Pure, deterministic, cheap enough to run on every save. Two kinds:

**Structural** (file-level):

- `plugin.json`, `marketplace.json`, and `package.json` are valid JSON with the
  required fields.
- `skills/memory/SKILL.md` opens and closes frontmatter, its `name:` matches the
  directory, the name is lowercase kebab-case, the description is present and
  within 1,024 chars, and there is body content.

**Behavioral** (exercises the real modules against temp dirs, never the user's
`~/.claude`):

- `store` — default limits are 2,200 / 1,375 chars, a fresh store is empty,
  write/read round-trips, `usedChars` counts entry *content* (not the `§`
  delimiters), and `renderStore` shows the label + usage % (and `(empty)` when
  empty).
- `security` — clean content passes; injection, `curl`-to-URL exfil, cloud API
  keys (including the canonical `AWS_SECRET_ACCESS_KEY`), private-key blocks, SSH
  backdoors, and invisible/bidi Unicode are all blocked.
- `correction` — strong patterns fire on their own, weak patterns fire only with
  a following directive word, and negative patterns ("no worries", "actually
  looks great") suppress — across a 12-case table.
- `curator` — fresh→active, 30d→stale, 90d→archivable, `pinned: true` is never
  aged out, a recorded use pulls an aged skill back to active, the weekly
  throttle opens/closes correctly, `archive()` *moves* (reversible), and `sweep`
  is notify-only until `MEMORY_CURATOR_ARCHIVE=1`. The clock is injected (`now`
  arg), so aging is tested without touching file mtimes.

## Integration checks

Independently valid files still have to compose as a plugin.

- The version string in `plugin.json`, the `marketplace.json` plugin entry, and
  `package.json` all agree (they are duplicated and must not drift).
- The marketplace name and entry name match `plugin.json`, and the entry source
  is `"."`.
- Every command in `hooks/hooks.json` points at a script that exists, and a
  `PostToolUse` hook matches the `Skill` tool (the Curator's use signal).
- `plugin.json`'s `mcpServers.memory` command points at a file that exists.
- All relative markdown links in the repo resolve.
- **The MCP server, spawned for real**, speaks JSON-RPC over stdio: `initialize`
  returns `serverInfo.name = "memory"`, `tools/list` exposes the four `memory_*`
  tools, and `tools/call` enforces add / dedup-no-op / over-capacity error /
  security block / list — proving `store` + `security` compose through the wire.

## End-to-end checks

Prove the plugin loads through the real Claude Code path. This costs ~$0.01 and
needs `claude` non-interactive auth, so it is **not** part of `npm test`.

```bash
npm run test:e2e
```

It runs one headless turn with `--plugin-dir .` and asserts:

- a `system/init` event is produced,
- `memory` appears in the loaded plugin list,
- `plugin_errors` is empty,
- the `memory` MCP server registered without failure (when the init event
  surfaces `mcp_servers`),
- the run completed without a Claude error.

Before running it, verify a plain `claude -p 'Reply ok'` can make a model call.
In CI, set `ANTHROPIC_API_KEY`.

## CI policy

- Always run `npm test` (unit + integration) — zero token, no auth needed.
- Run `npm run test:e2e` only when `ANTHROPIC_API_KEY` is configured; skip it
  cleanly for forks and unauthenticated environments.

## Good future checks

- **Hook scripts end-to-end** — pipe a fixture JSON event into
  `inject-memory.mjs` / `detect-correction.mjs` / `curate.mjs` and assert the
  emitted `additionalContext`. These are currently covered indirectly (via the
  modules they call) but not driven as hooks.
- **Behavioral evals** — once write-approval gating or any model-judged behavior
  lands, add JSON eval specs (afk-style) under `tests/e2e/evals/`.
