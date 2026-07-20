import { CHAPTERS } from '../content/playbook/chapters';
import { GUIDEBOOK } from '../content/playbook/guidebook';

/**
 * Content version stamp for the Playbook + Guidebook.
 *
 * WHY THIS EXISTS
 * A signature that records "George read the Playbook on 7/20" but not WHICH
 * VERSION is worth much less than it looks. The Guidebook says the tip pool
 * "may be adjusted based on business needs" and that PLAWA "we anticipate
 * changing over time" — so the document a teammate signed will drift, and
 * every prior acknowledgment quietly becomes a signature on a document that no
 * longer exists. If someone ever disputes a tip-pool split, you need to be able
 * to show what they actually agreed to.
 *
 * Cheap to record now; impossible to reconstruct after the fact, which is why
 * it went in before anyone but the owners had signed.
 *
 * DERIVED FROM THE CONTENT ITSELF, not a manually-bumped number — a hand-
 * maintained version would be forgotten on exactly the edit that mattered.
 * Any change to a word of either book yields a new stamp automatically.
 *
 * NOT a cryptographic hash and doesn't need to be: nothing here defends
 * against an attacker, it distinguishes revisions. djb2 over the serialized
 * content is deterministic across Node versions and stable between the page
 * render and the API call, which is all that's required.
 *
 * COMPUTED SERVER-SIDE ONLY. The client never supplies this — it would be
 * trivially forgeable, and the whole point is an honest record of what was on
 * screen when someone signed.
 */

function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Stable serialization — key order comes from the literals in the content
 *  modules, which only change when someone edits the content. */
function serialize(): string {
  return JSON.stringify({ p: CHAPTERS, g: GUIDEBOOK });
}

let cached: string | null = null;

/**
 * e.g. "pb-3f2a91c4". Stored on every acknowledgment; compared on the status
 * page to flag teammates whose signed version has since changed.
 */
export function playbookVersion(): string {
  if (!cached) cached = `pb-${djb2(serialize())}`;
  return cached;
}

/** Chapter/section counts — shown on the status page so a manager can see at a
 *  glance what the current version actually contains. */
export function playbookShape(): { chapters: number; guidebookChapters: number } {
  return { chapters: CHAPTERS.length, guidebookChapters: GUIDEBOOK.length };
}
