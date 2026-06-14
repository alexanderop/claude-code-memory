// Skill Curator — ports Hermes' active → stale (30d) → archived (90d) lifecycle.
//
// "Use" is the hard signal in Claude Code: mtime only reflects edits, so we
// record real invocations via a PostToolUse hook into a `.last-used` sidecar and
// take max(sidecar, SKILL.md mtime, dir mtime) as "last used" — a fresh or
// recently-edited skill is never falsely stale.
//
// Safety: notify-only by default (archiving requires MEMORY_CURATOR_ARCHIVE=1),
// `pinned: true` frontmatter is never touched, archiving MOVES (never deletes)
// into ~/.claude/skills/.archive/ and is fully reversible.

import { homedir } from "node:os";
import { join } from "node:path";
import {
  readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync,
} from "node:fs";

const DAY = 86400000;

export function skillsDir() {
  return process.env.MEMORY_SKILLS_DIR || join(homedir(), ".claude", "skills");
}

export const CONFIG = {
  staleDays: Number(process.env.MEMORY_CURATOR_STALE_DAYS || 30),
  archiveDays: Number(process.env.MEMORY_CURATOR_ARCHIVE_DAYS || 90),
  intervalDays: Number(process.env.MEMORY_CURATOR_INTERVAL_DAYS || 7),
  archiveEnabled: process.env.MEMORY_CURATOR_ARCHIVE === "1",
};

const curatorDir = () => join(skillsDir(), ".curator");
const lastRunFile = () => join(curatorDir(), "last-run");
const sanitize = (name) =>
  typeof name === "string" ? name.trim().replace(/[^a-zA-Z0-9._-]/g, "") : "";

// ---- weekly throttle ------------------------------------------------------

export function dueForRun(now = Date.now()) {
  try {
    if (!existsSync(lastRunFile())) return true;
    const t = Date.parse(readFileSync(lastRunFile(), "utf8").trim());
    if (Number.isNaN(t)) return true;
    return now - t >= CONFIG.intervalDays * DAY;
  } catch {
    return true;
  }
}

export function markRun(now = Date.now()) {
  try {
    mkdirSync(curatorDir(), { recursive: true });
    writeFileSync(lastRunFile(), new Date(now).toISOString() + "\n", "utf8");
  } catch {
    /* best-effort */
  }
}

// ---- usage tracking (called from the PostToolUse hook) --------------------

export function recordUse(name, now = Date.now()) {
  const slug = sanitize(name);
  if (!slug) return;
  const dir = join(skillsDir(), slug);
  if (!existsSync(join(dir, "SKILL.md"))) return; // only track our discoverable skills
  try {
    writeFileSync(join(dir, ".last-used"), new Date(now).toISOString() + "\n", "utf8");
  } catch {
    /* best-effort */
  }
}

// ---- classification -------------------------------------------------------

function isPinned(skillMdPath) {
  try {
    return /^\s*pinned:\s*true\s*$/im.test(readFileSync(skillMdPath, "utf8").slice(0, 1000));
  } catch {
    return false;
  }
}

function lastUsed(dir) {
  let t = 0;
  const max = (v) => { if (v && v > t) t = v; };
  try { max(statSync(join(dir, "SKILL.md")).mtimeMs); } catch { /* */ }
  try { max(statSync(dir).mtimeMs); } catch { /* */ }
  try { max(Date.parse(readFileSync(join(dir, ".last-used"), "utf8").trim())); } catch { /* */ }
  return t;
}

export function scan(now = Date.now()) {
  const root = skillsDir();
  const result = { active: [], stale: [], archivable: [] };
  if (!existsSync(root)) return result;

  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return result; }

  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue; // skip .curator / .archive
    const dir = join(root, e.name);
    const skill = join(dir, "SKILL.md");
    if (!existsSync(skill)) continue;

    const ageDays = Math.floor((now - lastUsed(dir)) / DAY);
    const item = { name: e.name, ageDays };
    if (isPinned(skill)) result.active.push(item);
    else if (ageDays >= CONFIG.archiveDays) result.archivable.push(item);
    else if (ageDays >= CONFIG.staleDays) result.stale.push(item);
    else result.active.push(item);
  }
  return result;
}

// ---- archiving (opt-in, reversible) ---------------------------------------

export function archive(name, now = Date.now()) {
  const root = skillsDir();
  const dest = join(root, ".archive", name);
  mkdirSync(join(root, ".archive"), { recursive: true });
  renameSync(join(root, name), dest);
  return dest;
}

export function sweep(now = Date.now()) {
  const s = scan(now);
  const archived = [];
  if (CONFIG.archiveEnabled) {
    for (const item of s.archivable) {
      try { archive(item.name, now); archived.push(item); } catch { /* skip on error */ }
    }
    s.archivable = s.archivable.filter((x) => !archived.some((a) => a.name === x.name));
  }
  return { stale: s.stale, archivable: s.archivable, archived, archiveEnabled: CONFIG.archiveEnabled };
}
