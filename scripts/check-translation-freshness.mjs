#!/usr/bin/env node
/**
 * check-translation-freshness.mjs
 *
 * Build-time guard against silent drift between English source pages
 * and their Spanish translations. For each (en, es) pair in TRANSLATION_PAIRS,
 * compares the latest git commit timestamp of each file. If the English
 * source is newer than the Spanish translation by more than DRIFT_THRESHOLD_DAYS,
 * prints a console warning so the next translation pass is visible.
 *
 * **Doesn't fail the build.** Translation freshness shouldn't block
 * production — drift visibility is the point, not enforcement. Vercel
 * builds keep shipping; the warning surfaces in the build logs so the
 * next maintainer notices.
 *
 * Hook into the build via package.json:
 *   "prebuild": "node scripts/check-translation-freshness.mjs"
 *
 * As more Spanish pages ship (planned Phase 2: /es/menu/cocktails,
 * /es/menu/food), add them to TRANSLATION_PAIRS. The script handles
 * any number of pairs.
 *
 * Edge cases handled:
 *   - Spanish file doesn't exist yet → warns and skips that pair
 *     (not an error — building toward a Spanish page is a valid state)
 *   - Git unavailable or file untracked → falls back to filesystem
 *     mtime via fs.statSync; still prints a result, just less accurate
 *   - English unchanged but Spanish edited (Spanish newer than English)
 *     → silent (the desirable state — Spanish reviewer caught up)
 */
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

/**
 * Each pair: { en: source path, es: target path } relative to repo root.
 * Add new pairs as Spanish pages ship.
 */
const TRANSLATION_PAIRS = [
  { en: "src/pages/bowl.astro", es: "src/pages/es/bowl.astro" },
];

/** Days of drift before we warn. Translation refresh isn't a same-day thing. */
const DRIFT_THRESHOLD_DAYS = 14;

/**
 * Return last-commit Date for `path`, or filesystem mtime if git is
 * unavailable / the file is untracked. Returns null if file doesn't exist.
 */
function lastModified(path) {
  const abs = resolve(repoRoot, path);
  if (!existsSync(abs)) return null;
  try {
    // %cI = committer date, strict ISO 8601 (parses cleanly via Date())
    const stdout = execSync(`git log -1 --format=%cI -- "${path}"`, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (stdout) return new Date(stdout);
    // File exists but never committed — fall back to filesystem mtime
    return statSync(abs).mtime;
  } catch {
    return statSync(abs).mtime;
  }
}

/** Round a millisecond delta to whole days for human-readable warnings. */
function daysBetween(a, b) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

let warningCount = 0;

for (const { en, es } of TRANSLATION_PAIRS) {
  const enMtime = lastModified(en);
  const esMtime = lastModified(es);

  if (enMtime === null) {
    console.warn(`[translation-freshness] WARN: English source missing — ${en}`);
    warningCount++;
    continue;
  }
  if (esMtime === null) {
    console.warn(`[translation-freshness] WARN: Spanish target missing — ${es} (planned but not yet built?)`);
    warningCount++;
    continue;
  }

  const drift = enMtime.getTime() - esMtime.getTime();
  if (drift <= 0) {
    // Spanish is current or newer than English — desirable state, no warning
    continue;
  }
  const driftDays = daysBetween(enMtime, esMtime);
  if (driftDays > DRIFT_THRESHOLD_DAYS) {
    console.warn(
      `[translation-freshness] WARN: ${es} is ${driftDays} days behind ${en} ` +
      `(threshold: ${DRIFT_THRESHOLD_DAYS} days). Re-translate before next deploy if English copy has changed substantively.`
    );
    warningCount++;
  }
}

if (warningCount === 0) {
  console.log(`[translation-freshness] OK — all ${TRANSLATION_PAIRS.length} translation pair(s) within ${DRIFT_THRESHOLD_DAYS}-day freshness window.`);
}

// Exit 0 always — this is a drift-visibility tool, not a build gate.
process.exit(0);
