// Lightweight content scanner. Memory entries get injected into the system
// prompt, so we reject the obvious injection / exfiltration / backdoor shapes
// and any invisible Unicode before an entry is ever persisted. This mirrors
// Hermes' "Security Scanning" stage — it is a guardrail, not a sandbox.

const THREAT_PATTERNS = [
  // Prompt-injection / instruction override
  /\bignore (all |any )?(previous|prior|above) (instructions|prompts)\b/i,
  /\b(system|developer) prompt\b.*\b(override|replace|reveal|print)\b/i,
  /\bdisregard\b.*\b(instructions|rules|guidelines)\b/i,
  // Credential / secret exfiltration
  /\b(curl|wget|fetch)\b[^\n]*\b(http|https):\/\//i,
  // Catches AWS_KEY, AWS_SECRET_KEY, and the canonical AWS_SECRET_ACCESS_KEY
  // (any run of uppercase/underscore between the cloud prefix and KEY).
  /\b(AWS|GITHUB|OPENAI|ANTHROPIC)[A-Z_]*KEY\b/i,
  /-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  // SSH backdoors
  /\bssh-(rsa|ed25519)\s+AAAA/,
  /authorized_keys/i,
];

// Zero-width and other invisible/bidi control characters.
const INVISIBLE = /[​-‏‪-‮⁠-⁯﻿]/;

export function scan(content) {
  if (INVISIBLE.test(content)) {
    return { ok: false, reason: "Content contains invisible/bidi Unicode characters." };
  }
  for (const re of THREAT_PATTERNS) {
    if (re.test(content)) {
      return { ok: false, reason: `Content matched a blocked threat pattern (${re}).` };
    }
  }
  return { ok: true };
}
