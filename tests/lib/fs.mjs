import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Recursively list files under `root` matching `predicate`, skipping VCS and
// dependency dirs. Ported from afk's tests/lib/fs.ts.
export function listFiles(root, predicate) {
  const found = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if ([".git", "node_modules"].includes(entry)) continue;
      found.push(...listFiles(path, predicate));
    } else if (predicate(path)) {
      found.push(path);
    }
  }
  return found.sort();
}

// Drop fenced ``` code blocks so link/reference checks ignore example snippets.
export function stripMarkdownCodeBlocks(markdown) {
  let inCodeBlock = false;
  const kept = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock) kept.push(line);
  }
  return kept.join("\n");
}
