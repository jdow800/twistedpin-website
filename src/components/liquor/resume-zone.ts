/**
 * Which shelf was the counter standing on?
 *
 * WHY THIS EXISTS. The count DRAFT survives anything — it is server-side, and
 * it resumes across a reload, a logout or a dead battery. The SELECTED ZONE
 * did not: both count screens ran `setZoneId(zones[0].id)` on boot, so any
 * fresh mount put the counter back at the first shelf on the list regardless
 * of where they actually were.
 *
 * Jon, 2026-09-08, describing the case that matters: "somebody might call your
 * phone, right? And then that interrupts the entire process. And then you've
 * got to be able to pick it back up in that same zone and just continue."
 *
 * A short call does not reach this code — React state survives backgrounding,
 * so the zone is still selected when the counter comes back. This is for the
 * mount that follows a RELOAD: a long call on a memory-pressured phone, a tab
 * eviction, a force-close, a battery swap.
 *
 * ⚠ THE OLD BEHAVIOUR WROTE COUNTS TO THE WRONG SHELF. Silently. The counter
 * resumes, sees their numbers restored, walks back to the walk-in freezer and
 * keeps dictating -- into whatever zone happened to sort first. Two things
 * then go wrong at once, and neither announces itself:
 *
 *   - the zone now drives the Deepgram keyterm budget (§11.39), so they get
 *     the first zone's vocabulary while speaking the freezer's contents --
 *     the exact degradation that change exists to remove; and
 *   - the lines are WRITTEN against the wrong zone_id, so the pre-submit
 *     check reports an entire shelf as "counted somewhere new", and answering
 *     "it lives there too" corrupts the membership map for every future walk.
 *
 * Keyed by SESSION, not by section: a new count starts with no memory, which
 * is correct -- "where I was" is only meaningful within one walk.
 *
 * Storage is best-effort by design. Safari in private mode throws on both read
 * and write, and a counter with cookies locked down must still be able to
 * count; every path here falls back to the first zone, which is exactly what
 * shipped before.
 */

const key = (sessionId: string) => `cogs:zone:${sessionId}`;

/** Remember the shelf. Never throws — storage is a nicety, counting is not. */
// `sessionId` is nullable at both call sites — the screens hold it as state
// that is null until the draft resolves. Widened here rather than guarded at
// each caller, because the no-session case is already a no-op.
export function rememberZone(sessionId: string | null, zoneId: string): void {
  if (!sessionId || !zoneId) return;
  try {
    window.localStorage.setItem(key(sessionId), zoneId);
  } catch {
    /* private mode, quota, disabled storage — the count still works */
  }
}

/**
 * The zone to open on. `available` is the live zone list and is the ONLY
 * authority on what is selectable: a remembered zone that has since been
 * renamed away, deactivated or reseeded must not be restored, or the counter
 * lands on a shelf the screen cannot render and has no way to leave.
 */
export function resumeZone(
  sessionId: string | null,
  available: ReadonlyArray<{ id: string }>,
  fallback: string = available[0]?.id ?? "",
): string {
  if (!sessionId) return fallback;
  try {
    const saved = window.localStorage.getItem(key(sessionId));
    if (saved && available.some((z) => z.id === saved)) return saved;
  } catch {
    /* fall through to the first zone */
  }
  return fallback;
}

/** Drop a finished count's memory so storage does not grow without bound. */
export function forgetZone(sessionId: string | null): void {
  if (!sessionId) return;
  try {
    window.localStorage.removeItem(key(sessionId));
  } catch {
    /* ignore */
  }
}
