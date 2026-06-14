// Regex correction detector, ported from pi-hermes-memory's correction-detector.ts.
// A two-pass filter: strong patterns always fire; weak patterns fire only when
// followed by a directive word; negative patterns suppress a would-be match.
// Detection is pure regex — no LLM call — so it's free to run on every prompt.

export const STRONG_PATTERNS = [
  /don'?t do that/i,
  /not like that/i,
  /^I said\b/i,
  /^I told you\b/i,
  /we already discussed/i,
  /^please don'?t/i,
  /^that'?s not what I/i,
];

export const WEAK_PATTERNS = [
  /^no[,.\s!]/i,
  /^wrong[,.\s!]/i,
  /^actually[,.\s]/i,
  /^stop[,.\s!]/i,
];

export const NEGATIVE_PATTERNS = [
  /^no worries/i,
  /^no problem/i,
  /^no thanks/i,
  /^no need/i,
  /^actually.{0,10}(looks? great|perfect|good|correct|right)/i,
  /^stop.{0,5}(there|here|for now)/i,
];

export const DIRECTIVE_WORDS = [
  "use", "don't", "dont", "do", "try", "make", "run", "install", "add",
  "remove", "delete", "change", "fix", "put", "set", "write", "go",
  "stop", "start", "the", "that", "this", "it",
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DIRECTIVE_RE = new RegExp(`\\b(${DIRECTIVE_WORDS.map(escape).join("|")})\\b`, "i");

export function isCorrection(text) {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (!t) return false;

  // Negative patterns win outright (e.g. "no worries", "actually looks great").
  for (const re of NEGATIVE_PATTERNS) if (re.test(t)) return false;

  // Strong patterns are high-confidence on their own.
  for (const re of STRONG_PATTERNS) if (re.test(t)) return true;

  // Weak patterns need a directive verb/word in what follows to count.
  for (const re of WEAK_PATTERNS) {
    const m = re.exec(t);
    if (m) {
      const remainder = t.slice(m.index + m[0].length);
      if (DIRECTIVE_RE.test(remainder)) return true;
    }
  }
  return false;
}
