// Drive the real MCP server over its stdio JSON-RPC transport, in-process and
// zero-token. Spawns `node mcp/memory-server.mjs`, writes each message as a
// newline-delimited JSON-RPC frame, then resolves with the responses keyed by id
// once the server's stdin closes. This is how the integration suite proves the
// server actually speaks the protocol — not just that its module imports.

import { spawn } from "node:child_process";
import { fromPluginRoot } from "./paths.mjs";

export function rpc(messages, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [fromPluginRoot("mcp", "memory-server.mjs")], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", () => {
      const byId = new Map();
      for (const line of out.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.id !== undefined && msg.id !== null) byId.set(msg.id, msg);
        } catch {
          /* ignore non-JSON lines */
        }
      }
      resolve({ byId, stderr: err });
    });

    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
    child.stdin.end();
  });
}

// Convenience: the text payload of a tools/call result (handlers return MCP
// content arrays). Returns "" if the shape is unexpected.
export function resultText(response) {
  const content = response?.result?.content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => c?.text ?? "").join("");
}

export function isToolError(response) {
  return response?.result?.isError === true;
}
