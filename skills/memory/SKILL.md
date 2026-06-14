---
name: memory
description: Save or update durable facts in persistent memory. Use when the user states a lasting preference, corrects you, reveals an environment/project fact, asks you to "remember" something, or when you learn a convention or lesson worth keeping across sessions. Backed by the memory_add / memory_replace / memory_remove MCP tools.
---

# Persistent memory

You have a bounded, curated memory that persists across sessions, backed by the
`memory_*` MCP tools. There are two stores:

- **`memory`** — your notes about the *environment and work*: OS/tooling, project
  structure, conventions, tool quirks/workarounds, and completed work. Limit ~2,200 chars.
- **`user`** — the *user's profile*: name, role, timezone, communication style,
  pet peeves, skill level, workflow habits. Limit ~1,375 chars.

The current contents are injected into your context at session start. That block
is a **frozen snapshot** — your writes this session land on disk immediately but
only appear in context next session. Trust the tool responses for live state.

## When to save (proactively — don't wait to be asked)

- **Preferences** → `user`: "I prefer TypeScript", "keep responses concise"
- **Corrections** → `memory`: "don't use sudo for docker, I'm in the docker group"
- **Environment facts** → `memory`: "staging is at 10.0.1.50, SSH port 2222"
- **Conventions** → `memory`: "this repo uses tabs, 120-col, run tests with `make test`"
- **Completed work** → `memory`: "migrated MySQL→Postgres on 2026-01-15"
- **Explicit requests** → "remember that my keys rotate monthly"

## When to skip

Vague/obvious info, easily re-discovered facts (web-searchable), raw data dumps,
one-off paths or debugging ephemera, and anything already in CLAUDE.md/AGENTS.md.

## How to write

- `memory_add({ target, content })` — append a new entry.
- `memory_replace({ target, old_text, content })` — `old_text` is a short *unique
  substring* of the entry to swap; merge overlapping facts into one shorter entry.
- `memory_remove({ target, old_text })` — drop a stale entry.

Keep entries compact and information-dense — pack related facts into one entry:

> Good: `User runs macOS 14, Homebrew, Docker Desktop. Shell zsh+oh-my-zsh. Editor VS Code w/ Vim keys.`
> Bad: `User has a project.`

## When a store is full

`memory_add` returns an error with `current_entries` and `usage` if the entry
won't fit. Don't give up — in the same turn, `memory_replace` to merge overlapping
entries into shorter ones (or `memory_remove` stale ones), then retry the add.
When a store is past ~80%, consolidate proactively before adding.
