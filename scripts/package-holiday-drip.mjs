import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// Package existing local artwork. No website build, credentials or external requests.
// campaign.json is editable scheduling data: this script never resets its state.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pack = resolve(repo, 'Context/marketing/holiday-drip-2026');
const read = name => readFile(resolve(pack, name), 'utf8');
const hash = data => createHash('sha256').update(data).digest('hex');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const campaign = JSON.parse(await read('campaign.json'));
const sourceManifests = await Promise.all(['nye-manifest.json', 'jingle-manifest.json'].map(async name => JSON.parse(await read(name))));
const records = sourceManifests.flatMap(m => m.records);
const outputs = [];
await mkdir(resolve(pack, 'qa'), { recursive: true });

for (const record of records) {
  const bytes = await readFile(resolve(pack, 'exports', record.filename));
  const meta = await sharp(bytes).metadata();
  if (hash(bytes) !== record.sha256 || meta.width !== record.width || meta.height !== record.height) throw new Error(`Export mismatch: ${record.filename}`);
  outputs.push({ filename: `exports/${record.filename}`, concept: record.concept, placement: record.format,
    width: meta.width, height: meta.height, bytes: bytes.length, sha256: hash(bytes), phase: record.phase, status: 'review-draft', alt_text: record.alt });
}
if (outputs.length !== 6 || new Set(outputs.map(r => r.filename)).size !== 6) throw new Error('Expected six unique first-batch exports');
const reference = await readFile(resolve(pack, 'reference-assets/jingle-wide.png'));
if (hash(reference) !== hash(await readFile(resolve(repo, 'public/jingle-bowl/jingle-wide.png')))) throw new Error('Google reference differs from approved source');
const refMeta = await sharp(reference).metadata();

const dateChecks = [];
for (const item of [...campaign.concepts, ...campaign.optional_extras, ...campaign.calendar]) {
  const date = new Date(item.proposed_publish_at);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  const actual = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  if (actual !== item.proposed_publish_at.slice(0, 16)) throw new Error(`Chicago date/offset mismatch: ${item.id}`);
  dateChecks.push({ id: item.id, local: item.proposed_publish_at, utc: date.toISOString() });
}
for (const item of campaign.concepts) {
  const row = campaign.calendar.find(r => r.id === item.id);
  if (!row || row.proposed_publish_at !== item.proposed_publish_at) throw new Error(`Calendar drift: ${item.id}`);
  for (const variant of Object.values(item.variants)) {
    if (!outputs.some(o => o.filename === variant.asset)) throw new Error(`Missing asset: ${variant.asset}`);
    if (variant.caption && !variant.caption.trim()) throw new Error(`Empty caption: ${item.id}`);
  }
}
if (new Date(campaign.events['nye-2026'].reservations_open_at).toISOString() !== '2026-11-18T15:00:00.000Z') throw new Error('Incorrect NYE opening');

const dateLabel = stamp => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(stamp));
const cardHtml = campaign.concepts.map(item => `<article><div class="card-heading"><p class="id">${esc(item.id)} · DRAFT</p><h2>${esc(item.title)}</h2><p>${esc(dateLabel(item.proposed_publish_at))}${item.optional_occasion ? ' · optional kickoff' : ''}</p></div><div class="art-pair"><figure><a href="${item.variants.facebook_feed.asset}"><img src="${item.variants.facebook_feed.asset}" alt="${esc(item.variants.facebook_feed.alt_text)}"></a><figcaption>Facebook + Instagram feed · 1080 × 1350</figcaption></figure><figure><a href="${item.variants.instagram_story.asset}"><img src="${item.variants.instagram_story.asset}" alt="${esc(item.variants.facebook_feed.alt_text)}"></a><figcaption>Optional Story · 1080 × 1920</figcaption></figure></div><details><summary>Review captions and link</summary><h3>Facebook</h3><textarea readonly aria-label="Facebook caption">${esc(item.variants.facebook_feed.caption)}</textarea><h3>Instagram</h3><textarea readonly aria-label="Instagram caption">${esc(item.variants.instagram_feed.caption)}</textarea><p>Use the bio wording only after verifying the correct event link. The plain-address alternate is saved in campaign.json.</p><p>Story sticker: ${esc(item.variants.instagram_story.link_sticker.label)} → <a href="${esc(item.url)}">${esc(item.url)}</a></p></details></article>`).join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Twisted Pin · Holiday drips · Batch 01 review</title><style>*{box-sizing:border-box}body{margin:0;background:#f3f0e9;color:#201b2e;font:16px/1.5 system-ui,sans-serif}header,main,footer{max-width:1180px;margin:auto;padding:28px}header{padding-top:48px}h1{font-size:clamp(30px,5vw,48px);line-height:1.1;margin:8px 0 18px}h2{font-size:27px;margin:4px 0}p{max-width:850px}.status{display:inline-block;background:#201b2e;color:#fff;padding:6px 12px;border-radius:4px;font-size:13px;letter-spacing:.05em}nav{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}nav a{padding:10px 16px;background:#fff;border:1px solid #ccc6bb;border-radius:5px}a{color:#204f4b}article{background:white;border:1px solid #d7d1c7;border-radius:10px;padding:24px;margin-bottom:28px}.id{font-size:12px;letter-spacing:.04em;color:#67606e}.art-pair{display:grid;grid-template-columns:1.15fr 1fr;gap:28px;align-items:start;margin:25px 0}figure{margin:0;text-align:center}img{display:block;width:100%;height:auto;border:1px solid #ddd}figcaption{font-size:13px;margin:8px 0;color:#625c67}details{border-top:1px solid #ddd;padding-top:18px}summary{cursor:pointer;font-weight:650}textarea{width:100%;min-height:210px;padding:14px;font:15px/1.5 system-ui;resize:vertical;border:1px solid #c7c0ce;border-radius:5px}h3{margin-bottom:8px}footer{font-size:14px;color:#625c67}@media(max-width:650px){header,main,footer{padding:20px}article{padding:16px}.art-pair{grid-template-columns:1fr;gap:22px}figure:nth-child(2){max-width:310px;margin:auto}}</style></head><body><header><span class="status">REVIEW DRAFT · NOT SCHEDULED</span><h1>A few well-timed holiday reminders.</h1><p>Three new compositions to sit alongside the social team's regular content. One shared 4:5 feed layout for Facebook and Instagram, plus a separately composed 9:16 Story for each idea. Click an image for the full-size export.</p><p>NYE points to reservations opening November 18 at 9am. Jingle Bowl is December 6 and is already bookable. The dates below are proposals.</p><nav><a href="calendar.md">Dated calendar</a><a href="batch-01-copy.txt">All first-batch copy</a><a href="campaign.json">Scheduling manifest</a><a href="schedule-this-campaign.txt">Reusable scheduling prompt</a><a href="contact-sheet.png">Contact sheet</a></nav></header><main>${cardHtml}</main><footer>Approved source art; new compositions and dates await review. Actual platform crops and Story overlays still need checking. No posting, scheduling or sending has occurred. Editable sources and reproduction instructions are in README.md.</footer></body></html>`;
await writeFile(resolve(pack, 'review.html'), html);

// A labeled overview only; never a publication asset.
const width = 1500, height = 1370;
const layers = [];
let labels = '<text x="45" y="50" font-size="30" font-weight="700">TWISTED PIN · HOLIDAY DRIPS</text><text x="45" y="83" font-size="18">Batch 01 · Review drafts · Dates proposed · Nothing scheduled</text>';
for (let i = 0; i < campaign.concepts.length; i++) {
  const item = campaign.concepts[i], x = 45 + 490 * i;
  labels += `<text x="${x}" y="128" font-size="19" font-weight="700">${esc(item.title)}</text><text x="${x}" y="157" font-size="15">${esc(dateLabel(item.proposed_publish_at))}</text><text x="${x}" y="195" font-size="15">FEED · FACEBOOK + INSTAGRAM</text><text x="${x}" y="802" font-size="15">STORY · OPTIONAL COMPANION</text>`;
  layers.push({ input: await sharp(resolve(pack, item.variants.facebook_feed.asset)).resize(440, 550).png().toBuffer(), left: x, top: 210 });
  layers.push({ input: await sharp(resolve(pack, item.variants.instagram_story.asset)).resize(281, 500).png().toBuffer(), left: x + 79, top: 820 });
}
const background = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f0e9"/><g font-family="Arial,sans-serif" fill="#201b2e">${labels}</g></svg>`);
await sharp(background).composite(layers).png().toFile(resolve(pack, 'contact-sheet.png'));
await writeFile(resolve(pack, 'export-manifest.json'), JSON.stringify({ status: 'review-drafts', outputs, reference_assets: [{ filename: 'reference-assets/jingle-wide.png', source: 'public/jingle-bowl/jingle-wide.png', width: refMeta.width, height: refMeta.height, sha256: hash(reference), purpose: 'Existing approved landscape art for optional Google Update; not a new visual' }] }, null, 2) + '\n');
await writeFile(resolve(pack, 'export-manifest.csv'), ['filename,width,height,placement,phase,status,sha256', ...outputs.map(r => [r.filename, r.width, r.height, r.placement, r.phase, r.status, r.sha256].join(','))].join('\n') + '\n');
await writeFile(resolve(pack, 'qa/verification.json'), JSON.stringify({ checked_at: new Date().toISOString(), checks: { six_unique_exports: true, dimensions_and_binary_hashes_match_source_manifests: true, google_reference_matches_tracked_art: true, chicago_offsets_and_local_dates: true, first_batch_calendar_manifest_consistent: true, all_variant_asset_paths_exist: true, nye_opening_instant: true }, date_checks: dateChecks, renderer_qa: ['nye-manifest.json', 'jingle-manifest.json'], limitations: ['Actual Facebook/Instagram upload crop and Story sticker overlays not tested.', 'No inventory lookup, social schedule/account inspection or publication.', 'No website/backend/runtime test suite needed for this documentation/artwork-only change.'] }, null, 2) + '\n');
console.log(JSON.stringify({ exports: outputs.length, calendar_entries: campaign.calendar.length, gallery: 'review.html', contact_sheet: 'contact-sheet.png', checks: 'passed' }));
