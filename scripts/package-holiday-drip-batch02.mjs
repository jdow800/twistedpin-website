import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// Local review packaging only. Never changes campaign state, schedules or publishes.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencyRoot = process.env.HOLIDAY_RENDER_DEPS ? resolve(process.env.HOLIDAY_RENDER_DEPS) : repo;
const require = createRequire(resolve(dependencyRoot, 'package.json'));
const sharp = require('sharp');
const { chromium } = require('playwright');
const campaignRoot = resolve(repo, 'Context/marketing/holiday-drip-2026');
const pack = resolve(campaignRoot, 'batch-02');
const hash = value => createHash('sha256').update(value).digest('hex');
const textHash = value => hash(value.replace(/\r\n?/g, '\n'));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const campaignText = await readFile(resolve(campaignRoot, 'campaign.json'), 'utf8');
const campaign = JSON.parse(campaignText);
const requestedIds = ['04-nye-mirrorball-moment', '05-jingle-santa-arrives'];
const replacements = { '04-nye-mirrorball-moment': '01-nye-set-the-clock', '05-jingle-santa-arrives': '02-jingle-santa-coming' };
if (!Array.isArray(campaign.alternative_concepts) || requestedIds.some(id => !campaign.alternative_concepts.some(item => item.id === id))) {
  throw Error('Batch 02 alternatives are not present in campaign.json yet. No files written; add the two review concepts before rerunning.');
}
const concepts = requestedIds.map(id => campaign.alternative_concepts.find(item => item.id === id));
const renderText = await readFile(resolve(pack, 'render-manifest.json'), 'utf8');
const renderManifest = JSON.parse(renderText);
const outputs = [];
for (const record of renderManifest.records) {
  if (!requestedIds.includes(record.concept)) throw Error(`Unexpected batch 02 concept: ${record.concept}`);
  const filename = `exports/${record.filename}`;
  const bytes = await readFile(resolve(pack, filename));
  const meta = await sharp(bytes).metadata();
  if (hash(bytes) !== record.sha256 || meta.width !== record.width || meta.height !== record.height) throw Error(`Export mismatch: ${filename}`);
  outputs.push({ filename, concept: record.concept, placement: record.format, width: meta.width, height: meta.height, bytes: bytes.length, sha256: hash(bytes), phase: record.phase, status: 'review-draft', alt_text: record.alt });
}
if (outputs.length !== 4 || new Set(outputs.map(item => item.filename)).size !== 4) throw Error('Expected exactly four unique batch 02 exports');
const dateChecks = [], alternativeChecks = [];
for (const item of concepts) {
  const original = campaign.concepts.find(row => row.id === replacements[item.id]);
  if (!original || original.event !== item.event || original.proposed_publish_at !== item.proposed_publish_at) throw Error(`Alternative must retain original event and proposed occasion: ${item.id}`);
  const group = campaign.creative_choice_groups?.find(row => row.id === item.creative_choice_group);
  if (item.alternative_to !== original.id || !group || group.calendar_occasion_id !== original.id || !group.concept_ids.includes(original.id) || !group.concept_ids.includes(item.id) || group.recommended_concept_id !== item.id || group.selected_concept_id !== null) throw Error(`Creative choice group must contain the unselected original/recommended alternative pair: ${item.id}`);
  if (item.approved_by || item.approved_at || item.scheduled_at || item.published_at || (item.selected_channels || []).length) throw Error(`Batch 02 review packaging cannot represent an approved or selected post: ${item.id}`);
  for (const [name, variant] of Object.entries(item.variants)) {
    if (!variant.asset.startsWith('batch-02/') || !outputs.some(out => `batch-02/${out.filename}` === variant.asset && out.concept === item.id)) throw Error(`Variant asset mismatch: ${item.id} ${name}`);
    if (name.endsWith('_feed') && !variant.caption?.trim()) throw Error(`Missing feed caption: ${item.id} ${name}`);
  }
  const instant = new Date(item.proposed_publish_at);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(part => [part.type, part.value]));
  const actualLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  if (actualLocal !== item.proposed_publish_at.slice(0, 16) || (item.proposed_publish_at_utc && instant.toISOString() !== new Date(item.proposed_publish_at_utc).toISOString())) throw Error(`Chicago date/offset mismatch: ${item.id}`);
  dateChecks.push({ id: item.id, proposed_local: item.proposed_publish_at, utc: instant.toISOString() });
  alternativeChecks.push({ alternative: item.id, original: original.id, same_event: true, same_proposed_occasion: true, extra_post: false, creative_choice_group: group.id, calendar_occasion_id: group.calendar_occasion_id, recommended_concept_id: group.recommended_concept_id, selected_concept_id: group.selected_concept_id });
}
if (campaign.scheduling_authorized || campaign.publication_authorized) throw Error('This gallery is only for an unscheduled review campaign');
const dateLabel = stamp => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(stamp));
const localAsset = path => path.replace(/^batch-02\//, '');
const figures = item => ['facebook_feed', 'instagram_story'].map((name, i) => {
  const variant = item.variants[name], filename = localAsset(variant.asset);
  const record = outputs.find(out => out.filename === filename);
  return `<figure><figcaption><strong>${i ? 'Story' : 'Facebook + Instagram feed'}</strong><span>${record.width} × ${record.height}${i ? ' · optional companion' : ''}</span></figcaption><a href="${esc(filename)}" aria-label="Open full-size ${i ? 'Story' : 'feed'} artwork"><img src="${esc(filename)}" alt="${esc(variant.alt_text || record.alt_text)}" width="${record.width}" height="${record.height}"></a></figure>`;
}).join('');
const cards = concepts.map(item => `<article id="${esc(item.id)}"><div class="concept-header"><p class="eyebrow">${item.event === 'nye-2026' ? 'NEW YEAR’S EVE' : 'JINGLE BOWL'} · RECOMMENDED ALTERNATIVE</p><h2>${esc(item.title)}</h2><p class="occasion">Proposed: ${esc(dateLabel(item.proposed_publish_at))}</p><p class="replacement">Choose this <em>or</em> ${esc(replacements[item.id])} for the same occasion. This is not an additional post.</p></div><div class="art-pair">${figures(item)}</div><details open><summary>Captions & publishing notes</summary><div class="copy-grid"><section><h3>Facebook caption</h3><textarea readonly aria-label="${esc(item.title)} Facebook caption">${esc(item.variants.facebook_feed.caption)}</textarea></section><section><h3>Instagram caption</h3><textarea readonly aria-label="${esc(item.title)} Instagram caption">${esc(item.variants.instagram_feed.caption)}</textarea></section></div><p><strong>Story:</strong> ${esc(item.variants.instagram_story.editorial_message || 'Use the artwork and add the native link sticker.')}</p><p><strong>Link sticker:</strong> ${esc(item.variants.instagram_story.link_sticker.label)} · <a href="${esc(item.url)}">${esc(item.url)}</a></p><p class="note">Instagram bio wording requires the correct event link. Add the native Story link sticker in the clear lower area and inspect the actual app preview. Generated hero artwork is illustrative; it is not a photograph of Twisted Pin or its event.</p></details></article>`).join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Twisted Pin · Cinematic holiday concepts · Batch 02</title><style>*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#080d17;color:#f4efe3;font:16px/1.6 system-ui,sans-serif}header,main,footer{max-width:1320px;margin:auto;padding:36px}header{padding-top:62px;padding-bottom:20px}.status{display:inline-block;border:1px solid #3d4d59;padding:5px 11px;color:#4eecc4;font-size:12px;font-weight:750;letter-spacing:.09em;border-radius:4px}h1{font-size:clamp(34px,4.8vw,62px);line-height:1.08;letter-spacing:-.035em;max-width:900px;margin:22px 0}header p{max-width:830px;color:#b8bec8}strong{color:#f4efe3}nav{display:flex;flex-wrap:wrap;gap:10px;margin-top:25px}nav a{background:#17202e;border:1px solid #2e3c4c;padding:9px 14px;border-radius:5px;text-decoration:none;color:#e4e7eb}a{color:#4eecc4;overflow-wrap:anywhere}article{background:#101824;border:1px solid #283343;border-radius:12px;margin-bottom:36px;padding:30px;overflow:hidden}.eyebrow{color:#4eecc4;font-weight:750;font-size:12px;letter-spacing:.09em;margin:0 0 8px}h2{font-size:clamp(28px,3vw,40px);line-height:1.12;margin:0 0 12px}.occasion{margin:0;color:#f4efe3;font-weight:650}.replacement{margin:10px 0 0;color:#b8bec8;font-size:14px}.art-pair{display:grid;grid-template-columns:1fr .88fr;gap:34px;align-items:start;margin:28px 0 30px}figure{margin:0;min-width:0}figcaption{display:flex;flex-direction:column;margin-bottom:12px;font-size:14px}figcaption span{color:#a7b1be;font-size:12px}figure img{display:block;width:100%;height:auto;border:1px solid #2c3644;border-radius:5px}figure a{display:block}details{border-top:1px solid #2e394a;padding-top:20px}summary{cursor:pointer;font-size:17px;font-weight:750}.copy-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}h3{font-size:14px;margin:22px 0 8px;color:#cdd4df}textarea{display:block;width:100%;min-height:245px;resize:vertical;border:1px solid #3a4759;border-radius:6px;background:#090f1a;color:#e8e5df;padding:15px;font:14px/1.55 system-ui}.note{font-size:13px;color:#a7b1be}footer{color:#a7b1be;font-size:13px;padding-top:0}@media(max-width:680px){header,main,footer{padding:22px}header{padding-top:32px}article{padding:18px}.art-pair,.copy-grid{grid-template-columns:1fr;gap:22px}figure:nth-child(2){max-width:330px;width:100%;margin:auto}nav a{font-size:13px}textarea{min-height:280px}.replacement{font-size:13px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}</style></head><body><header><span class="status">BATCH 02 · REVIEW DRAFT · NOTHING SCHEDULED</span><h1>Make the moment<br>feel like an event.</h1><p>Two fresh, cinematic directions for the holiday drips. <strong>These are recommended alternatives to the earlier kickoff and Santa concepts, not extra posts.</strong> Each includes a purpose-composed feed and Story layout.</p><p>Dates and copy remain proposals. Choosing a visual does not approve scheduling or publication.</p><nav><a href="#04-nye-mirrorball-moment">NYE concept</a><a href="#05-jingle-santa-arrives">Jingle concept</a><a href="contact-sheet.png">Contact sheet</a><a href="../campaign.json">Scheduling source</a><a href="../review.html">Earlier concepts</a><a href="README.md">Source & reproduction</a></nav></header><main>${cards}</main><footer>Illustrative generated artwork, supplied Twisted Pin logo and existing typography. Final platform crop, Story overlays, links, event phase and availability still require publisher checks. No social account was accessed by this packager.</footer></body></html>`;

await mkdir(resolve(pack, 'qa'), { recursive: true });
await writeFile(resolve(pack, 'review.html'), html);
// Labeled review overview only; do not upload this instead of full-size exports.
const sheetWidth = 1440, sheetHeight = 1920, layers = [];
let labels = '<text x="48" y="65" font-size="38" font-weight="700">TWISTED PIN · HOLIDAY MOMENTS</text><text x="48" y="105" font-size="20" fill="#aab8c6">Batch 02 · Recommended alternatives · Proposed dates · Nothing scheduled</text>';
for (const [index, item] of concepts.entries()) {
  const columnX = 48 + index * 696;
  labels += `<text x="${columnX}" y="168" font-size="27" font-weight="700" fill="#4eecc4">${item.event === 'nye-2026' ? 'NYE · A PROPER SEND-OFF.' : 'JINGLE · MAKE WAY FOR SANTA.'}</text><text x="${columnX}" y="205" font-size="18">${esc(dateLabel(item.proposed_publish_at))} · proposed</text><text x="${columnX}" y="245" font-size="17" fill="#aab8c6">FACEBOOK + INSTAGRAM FEED</text><text x="${columnX}" y="990" font-size="17" fill="#aab8c6">STORY · OPTIONAL COMPANION</text>`;
  layers.push({ input: await sharp(resolve(campaignRoot, item.variants.facebook_feed.asset)).resize(540, 675).png().toBuffer(), left: columnX + 54, top: 265 });
  layers.push({ input: await sharp(resolve(campaignRoot, item.variants.instagram_story.asset)).resize(450, 800).png().toBuffer(), left: columnX + 99, top: 1010 });
}
labels += '<text x="48" y="1874" font-size="19" fill="#aab8c6">Choose one creative per occasion. These alternatives do not add posts to the calendar.</text>';
const sheet = Buffer.from(`<svg width="${sheetWidth}" height="${sheetHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b111c"/><path d="M720 147V1824" stroke="#293746"/><g font-family="Arial,sans-serif" fill="#f4efe3">${labels}</g></svg>`);
await sharp(sheet).composite(layers).png({ compressionLevel: 9 }).toFile(resolve(pack, 'contact-sheet.png'));

const browserChannel = process.env.HOLIDAY_RENDER_BROWSER_CHANNEL;
const browser = await chromium.launch({ headless: true, ...(browserChannel ? { channel: browserChannel } : {}) });
const browserChecks = [], browserVersion = browser.version();
let outboundNetworkRequests = 0;
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route(/^https?:/i, route => { outboundNetworkRequests++; return route.abort(); });
    await page.goto(pathToFileURL(resolve(pack, 'review.html')).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    const checks = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      articleCount: document.querySelectorAll('article').length,
      images: [...document.images].map(image => ({ source: image.getAttribute('src'), complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, displayedWidth: image.getBoundingClientRect().width })),
      captionCount: document.querySelectorAll('textarea').length,
      captionsNonempty: [...document.querySelectorAll('textarea')].every(area => area.value.trim().length > 20),
      alternativesNotice: document.body.innerText.includes('not extra posts'),
      noScheduledClaim: document.body.innerText.includes('NOTHING SCHEDULED'),
    }));
    if (checks.horizontalOverflow || checks.articleCount !== 2 || checks.images.length !== 4 || checks.images.some(image => !image.complete || image.naturalWidth !== 1080 || ![1350, 1920].includes(image.naturalHeight)) || checks.captionCount !== 4 || !checks.captionsNonempty || !checks.alternativesNotice || !checks.noScheduledClaim || pageErrors.length) throw Error(`Gallery browser checks failed: ${JSON.stringify({ viewport, checks, pageErrors })}`);
    browserChecks.push({ viewport, ...checks, pageErrors });
    await page.close();
  }
} finally { await browser.close(); }
if (outboundNetworkRequests) throw Error(`Unexpected gallery outbound requests: ${outboundNetworkRequests}`);
const contactBytes = await readFile(resolve(pack, 'contact-sheet.png'));
const packagerPath = 'scripts/package-holiday-drip-batch02.mjs';
await writeFile(resolve(pack, 'export-manifest.json'), JSON.stringify({
  status: 'review-drafts', role: 'Recommended alternatives, not extra posts.',
  packager: { path: packagerPath, sha256: textHash(await readFile(fileURLToPath(import.meta.url), 'utf8')), hashNormalization: 'UTF-8 text with LF line endings' },
  render_manifest: { path: 'render-manifest.json', sha256: textHash(renderText), hashNormalization: 'UTF-8 text with LF line endings' },
  outputs, alternatives: alternativeChecks,
  review_artifacts: [{ filename: 'review.html', sha256: textHash(html), hashNormalization: 'UTF-8 text with LF line endings' }, { filename: 'contact-sheet.png', width: sheetWidth, height: sheetHeight, bytes: contactBytes.length, sha256: hash(contactBytes), purpose: 'Review overview only; not a publishing asset' }],
}, null, 2) + '\n');
await writeFile(resolve(pack, 'qa/verification.json'), JSON.stringify({
  checked_at: new Date().toISOString(),
  checks: { four_unique_exports: true, dimensions_and_binary_hashes_match_render_manifest: true, alternative_event_and_proposed_date_match_original_occasion: true, approval_selection_schedule_publication_empty: true, chicago_dates_and_offsets: true, all_variant_asset_paths_match: true, gallery_390_and_1440: true, outbound_network_requests: outboundNetworkRequests },
  date_checks: dateChecks, alternative_checks: alternativeChecks, browser_checks: browserChecks,
  tools: { node: process.version, playwright: require('playwright/package.json').version, sharp: require('sharp/package.json').version, browser: browserVersion, browserChannel: browserChannel || 'bundled-chromium' },
  limitations: ['No actual Facebook/Instagram upload crop, link sticker or account scheduling preview was tested.', 'No inventory lookup, social publication, customer send, runtime build or deployment occurred.', 'Dates and creative remain proposed. Choosing an alternative does not create another editorial occasion.'],
}, null, 2) + '\n');
console.log(JSON.stringify({ exports: outputs.length, alternatives: concepts.length, gallery: 'batch-02/review.html', contact_sheet: 'batch-02/contact-sheet.png', browser_viewports: [390, 1440], checks: 'passed' }));
