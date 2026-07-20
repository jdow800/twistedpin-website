/**
 * Twisted Pin — /playbook photography pipeline
 *
 * Encodes the teammate-supplied Playbook photos (dropped in
 * `Context/Playbook and guidebook photos/part {1,2,3}/`) to responsive
 * `public/playbook/<name>-{w}.{avif,webp,jpg}` outputs that the paged reader
 * renders above each chapter title.
 *
 * These are NOT LCP elements — every chapter photo sits inside a `hidden`
 * (display:none) page and is `loading="lazy"`, so quality bias is toward small
 * files. Same three-format ladder + `<picture>` order (avif → webp → jpg) as
 * the /snap pipeline; same attention-based cover-crop so faces survive.
 *
 * Aspect per role:
 *   - single hero  → 3:2 landscape, sits full-column-width at a chapter's top
 *   - gallery tile → 4:5 portrait, two-up grid (most story photos are phone
 *                    portraits, so 4:5 keeps faces without heavy cropping)
 *   - our-story    → 3:2 timeline tiles (storefront signage is landscape;
 *                    a 4:5 crop would clip the sign)
 *
 * Sources missing from the worktree are warned and skipped — the photo folder
 * is gitignored and won't exist on a fresh clone. Re-run after adding photos:
 *   node scripts/build-playbook-images.mjs
 */
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PICS = path.join(ROOT, "Context", "Playbook and guidebook photos");
const OUT  = path.join(ROOT, "public", "playbook");

// Widths per role. Reading column caps at 34rem (~544px); gallery tiles are
// roughly half that. Two widths each (1x + 2x retina) is plenty for a
// non-LCP staff page.
const HERO_W  = [640, 1280];
const TILE_W  = [440, 880];
const WIDE_W  = [520, 1040];

const SOURCES = [
  // ── front matter ──────────────────────────────────────────────────────
  // Welcome: full crew in Halloween costumes, arms around each other — the
  // "this is the fam" candid the imageNote asks for (not posed-corporate).
  { src: "part 3/596397718_26003400169263275_6520457537754667949_n.jpg", name: "welcome", aspect: [3, 2], widths: HERO_W },

  // Dedication: team holding the Herald-News "Best Bowling Alley in Will
  // County 2025" plaque — doubles as social proof.
  { src: "part 1/623414622_18557947672030638_3187017587428257311_n.jpg", name: "dedication", aspect: [3, 2], widths: HERO_W },

  // Our Story timeline — chronological: Pioneer Lanes (2014 purchase) →
  // Plainfield Lanes (rename) → Twisted Pin sign going up (2023) → the Dow
  // brothers. 3:2 keeps the storefront signage legible.
  { src: "part 1/20131111_112851.jpg",                                    name: "our-story-pioneer",    aspect: [3, 2], widths: WIDE_W },
  { src: "part 1/thumbnail_20201124_113918-900x675.jpg",                  name: "our-story-plainfield", aspect: [3, 2], widths: WIDE_W },
  { src: "part 1/IMG_9812.jpg",                                           name: "our-story-twistedpin", aspect: [3, 2], widths: WIDE_W },
  { src: "part 1/120478954_10217498909009400_8423399377873268969_n.jpg",  name: "our-story-brothers",   aspect: [3, 2], widths: WIDE_W },

  // ── part one: single heroes ───────────────────────────────────────────
  // Our Purpose: a mom and her son sharing a toast — the chapter's whole
  // point is the host getting to be a guest.
  { src: "part 1/grad.png",   name: "our-purpose",  aspect: [3, 2], widths: HERO_W },
  // Our Culture: the cup-stacking team-building moment.
  { src: "part 1/F1_P38.jpg", name: "our-culture",  aspect: [3, 2], widths: HERO_W },
  // Notice the Moments: an older guest on his feet, mid-cheers, glass raised.
  { src: "part 2/cheering.jpg", name: "notice-the-moments", aspect: [3, 2], widths: HERO_W },
  // Communicate Early: a mom-and-daughter pair, cheek to cheek.
  { src: "part 3/CVd6eC2rK6pmRv7hrC1gHzzVp6HGhXct_photo-1782606211294.jpg", name: "communicate-early", aspect: [3, 2], widths: HERO_W },
  // Safety Matters: the crew together — looking out for one another.
  { src: "part 3/521005013_10233341707619024_7104302299671272924_n.jpg", name: "safety-matters", aspect: [3, 2], widths: HERO_W },
  // Growing Together: young teammates on a team outing, thumbs up.
  { src: "part 3/501301141_10232245267168698_3509539140919044520_n.jpg", name: "growing-together", aspect: [3, 2], widths: HERO_W },
  // One Last Thing: four teammates, arms around each other, at the bar.
  { src: "part 3/516217304_10233231058732871_4526837853465303424_n.jpg", name: "one-last-thing", aspect: [3, 2], widths: HERO_W },

  // ── part one: galleries (4:5 portrait tiles) ──────────────────────────
  // Better Together — three simultaneous-event beats: pizza buffet being
  // served, the VIP suite mid-event, teammates plating at the setup.
  { src: "part 2/pizzaevent.jpg", name: "better-together-1", aspect: [4, 5], widths: TILE_W },
  { src: "part 2/eventvip.jpg",   name: "better-together-2", aspect: [4, 5], widths: TILE_W },
  { src: "part 2/F6_P26.jpg",     name: "better-together-3", aspect: [4, 5], widths: TILE_W },

  // Own the Outcome — a kid in a balloon octopus hat, and hosts in Harley
  // Quinn / Batgirl costumes with a birthday girl.
  { src: "part 2/499923699_4002324226654631_6479531793972914183_n.jpg",     name: "own-the-outcome-1", aspect: [4, 5], widths: TILE_W },
  { src: "part 2/73031957_2434785676741835_1173350280327069696_n-1.jpg",    name: "own-the-outcome-2", aspect: [4, 5], widths: TILE_W },

  // Protect the Experience — two kids showing off their arcade game cards,
  // and a birthday girl in her crown and light-up necklace.
  { src: "part 2/CWqIbQ6SHiJ83bm7AHgvmbVzVxEq098w_photo-1778895588589.jpg", name: "protect-1", aspect: [4, 5], widths: TILE_W },
  { src: "part 2/486192165_1467876741159670_2484706368459718746_n.jpg",     name: "protect-2", aspect: [4, 5], widths: TILE_W },

  // Everyone Belongs — Joe finishing a bubble-domed cocktail, and a couple
  // laughing over skeeball.
  { src: "part 3/518323430_10233239951795192_8410202378991626080_n.jpg", name: "everyone-belongs-1", aspect: [4, 5], widths: TILE_W },
  { src: "part 3/DSC08838.jpg",                                          name: "everyone-belongs-2", aspect: [4, 5], widths: TILE_W },

  // Details Matter — two proposals: mid-kneel at the VIP lanes, and the
  // couple in front of the "Will you marry me?" video wall.
  { src: "part 3/487232175_1470633614217316_5540193064442882248_n.jpg",     name: "details-matter-1", aspect: [4, 5], widths: TILE_W },
  { src: "part 3/GxfjFRNwA42Iz1zLXGpVp9fqCZXLsI5h_photo-1777930680161.jpg",  name: "details-matter-2", aspect: [4, 5], widths: TILE_W },
];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function encodeOne({ src, name, aspect, widths }) {
  const srcPath = path.join(PICS, src);
  if (!(await exists(srcPath))) {
    console.warn(`SKIP  ${name}: source missing at ${srcPath}`);
    return;
  }

  const meta = await sharp(srcPath).metadata();
  console.log(`source: ${src}  ${meta.width}×${meta.height} (${meta.format})  → ${name}-*  [crop ${aspect[0]}:${aspect[1]}]`);

  for (const w of widths) {
    const h = Math.round((w * aspect[1]) / aspect[0]);
    const resizeOpts = { width: w, height: h, fit: "cover", position: "attention", withoutEnlargement: true };

    const avifOut = path.join(OUT, `${name}-${w}.avif`);
    const webpOut = path.join(OUT, `${name}-${w}.webp`);
    const jpgOut  = path.join(OUT, `${name}-${w}.jpg`);

    await sharp(srcPath).resize(resizeOpts).avif({ quality: 50, effort: 4 }).toFile(avifOut);
    await sharp(srcPath).resize(resizeOpts).webp({ quality: 72, effort: 5 }).toFile(webpOut);
    await sharp(srcPath).resize(resizeOpts).jpeg({ quality: 76, progressive: true, mozjpeg: true }).toFile(jpgOut);

    const [a, wp, j] = await Promise.all([stat(avifOut), stat(webpOut), stat(jpgOut)]);
    const om = await sharp(webpOut).metadata();
    console.log(`  ${w}px  ${om.width}×${om.height}  avif ${(a.size/1024).toFixed(1)}KB  webp ${(wp.size/1024).toFixed(1)}KB  jpg ${(j.size/1024).toFixed(1)}KB`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const entry of SOURCES) await encodeOne(entry);
}

main().catch((e) => { console.error(e); process.exit(1); });
