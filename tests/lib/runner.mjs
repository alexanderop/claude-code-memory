// Tiny zero-dependency test harness, mirroring afk's tests/lib/runner.ts.
// Each runner builds one TestRun, calls pass()/fail()/section() as it goes,
// then summary() + process.exit(exitCode()).

export class TestRun {
  passed = 0;
  failed = 0;

  pass(label) {
    console.log(`  PASS ${label}`);
    this.passed += 1;
  }

  fail(label, detail) {
    console.log(`  FAIL ${label}`);
    if (detail) {
      console.log(`     ${detail}`);
    }
    this.failed += 1;
  }

  section(label) {
    console.log("");
    console.log(`${label}:`);
  }

  // Assert helper: pass when `cond` is truthy, fail (with optional detail) otherwise.
  check(cond, label, detail) {
    if (cond) this.pass(label);
    else this.fail(label, detail);
  }

  summary(extraLines = []) {
    for (const line of extraLines) {
      console.log(line);
    }
    console.log("");
    console.log(`Passed: ${this.passed}  Failed: ${this.failed}`);
  }

  exitCode() {
    return this.failed === 0 ? 0 : 1;
  }
}

export function containsCaseInsensitive(haystack, needle) {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

export function envNumber(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
