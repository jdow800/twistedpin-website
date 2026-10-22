import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Record an already verified scheduling operation. No network, publishing, image
// changes or current-clock timestamps. The receipt, not this script, is evidence.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pack = resolve(repo, 'Context/marketing/holiday-drip-2026');
const out = resolve(pack, 'posting-dates');
const receiptRef = 'scheduling/receipt.json';
const portableReceipt = 'scheduling-receipt.json';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const json = value => JSON.stringify(value, null, 2) + '\n';
const hash = value => createHash('sha256').update(value).digest('hex');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const stamp = value => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw Error('Missing/invalid receipt timestamp');
  return new Date(value).toISOString();
};
const c = await readJson(resolve(pack, 'campaign.json'));
const m = await readJson(resolve(out, 'campaign-manifest.json'));
const receipt = await readJson(resolve(pack, receiptRef));
const verifiedAt = stamp(receipt.verified_at);
const createdAt = stamp(receipt.scheduled_created_at);
if (receipt.authorization?.approved_by !== 'Jon' || receipt.timezone !== 'America/Chicago' || receipt.status !== 'scheduled' || receipt.failed !== 0 || receipt.published !== 0 || receipt.duplicate_count !== 0) throw Error('Expected Jon-authorized, verified scheduling receipt without failures or publication');
const approvedAt = stamp(receipt.authorization.approved_at || receipt.scheduled_created_at);
const channels = ['facebook_feed', 'instagram_feed'];
if (receipt.authorization.scope?.length !== 2 || channels.some(channel => !receipt.authorization.scope.includes(channel))) throw Error('Receipt authorization must be feed-only');
for (const key of ['source_hashes', 'uploaded_media_download_hashes', 'utc_and_local_times', 'server_validation', 'remote_captions', 'remote_media_and_alt', 'remote_accounts', 'remote_feed_types', 'queue_has_exactly_expected_ids']) if (receipt.verification?.[key] !== true) throw Error('Receipt verification missing: ' + key);
const platformKeys = {facebook_feed: 'FACEBOOK', instagram_feed: 'INSTAGRAM'};
const scope = {
  approved_by: 'Jon', approved_at: approvedAt,
  channels, occasions: 16, automatic_feed_publication_authorized: true,
  excluded: ['Facebook Stories', 'Instagram Stories', 'Google Business Profile', 'SMS', 'email', 'paid advertising'],
  evidence: receipt.authorization,
  note: 'Authorization covers the sixteen supplied feed occasions on Facebook and Instagram at their recorded times. It does not authorize duplicate posts or other channels.',
};
const posts = c.post_copy_drafts;
if (posts?.length !== 16 || m.posts?.length !== 16 || receipt.posts?.length !== 16 || new Set(receipt.posts.map(p => p.calendar_id)).size !== 16) throw Error('Expected exactly sixteen distinct scheduled occasions');
const writes = new Map();
const prepared = [];
const allIds = new Set();
for (const p of posts) {
  const r = receipt.posts.find(item => item.calendar_id === p.calendar_id);
  const entry = m.posts.find(item => item.calendar_id === p.calendar_id);
  const row = c.calendar.find(item => item.id === p.calendar_id);
  if (!r || !entry || !row || r.folder !== entry.folder || p.delivery_folder !== 'posting-dates/' + r.folder) throw Error('Receipt/folder mismatch: ' + p.calendar_id);
  const folder = resolve(out, r.folder);
  if (!folder.startsWith(out + sep) || !/^\d{4}-\d{2}-\d{2}_[A-Za-z-]+$/.test(r.folder)) throw Error('Invalid posting folder');
  const localPost = await readJson(resolve(folder, 'post.json'));
  if (localPost.calendar_id !== p.calendar_id || localPost.assets.feed.sha256 !== entry.assets.feed.sha256) throw Error('Local manifest mismatch: ' + p.calendar_id);
  const utc = stamp(r.scheduled_at_utc);
  if (utc !== stamp(p.proposed_publish_at_utc) || utc !== stamp(r.scheduled_at_local)) throw Error('Scheduled target mismatch: ' + p.calendar_id);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: receipt.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(utc)).map(part => [part.type, part.value]));
  if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` !== r.scheduled_at_local.slice(0, 16)) throw Error('Chicago wall time mismatch: ' + p.calendar_id);
  if (r.status !== 'SCHEDULED' || !r.post_id || allIds.has(r.post_id) || !/^https:\/\//.test(r.media_url || '') || !/^[a-f0-9]{64}$/i.test(r.sha256 || '')) throw Error('Missing/duplicate scheduler ID or invalid scheduling/media evidence');
  allIds.add(r.post_id);
  const actualHash = hash(await readFile(resolve(folder, entry.assets.feed.filename)));
  if (actualHash !== r.sha256 || actualHash !== entry.assets.feed.sha256 || r.alt_text !== entry.assets.feed.alt_text) throw Error('Scheduled image/alt evidence mismatch: ' + p.calendar_id);
  for (const object of [p, entry, row, localPost]) {
    if (object.published_at || /^(published|publishing|failed|canceled|cancelled)$/i.test(object.status || '')) throw Error('Refusing to overwrite later execution state: ' + p.calendar_id);
    if (object.scheduler_post_id && object.scheduler_post_id !== r.post_id) throw Error('Conflicting existing schedule: ' + p.calendar_id);
    if (object.scheduled_at && stamp(object.scheduled_at) !== utc) throw Error('Refusing to overwrite a changed target time: ' + p.calendar_id);
  }
  const ids = {}, scheduledCaptions = {};
  for (const [channel, platform] of Object.entries(platformKeys)) {
    const detail = r.platforms?.[platform];
    const expected = platform === 'FACEBOOK' ? p.variants.facebook_feed.caption : p.variants.instagram_feed.alternate_caption_without_verified_bio_link;
    if (!detail?.id || !detail.connection_id || detail.status !== 'PENDING' || detail.post_type !== 'FEED' || detail.text !== expected || allIds.has(detail.id)) throw Error('Platform verification/caption mismatch: ' + p.calendar_id + ' ' + platform);
    if (platform === 'FACEBOOK' && detail.page_id !== receipt.accounts.pageId || platform === 'INSTAGRAM' && detail.connection_id !== receipt.accounts.instagramConnectionId) throw Error('Account mismatch: ' + p.calendar_id + ' ' + platform);
    allIds.add(detail.id);
    ids[channel] = {provider: 'AdaptlyPost', post_id: r.post_id, platform_record_id: detail.id, connection_id: detail.connection_id, ...(detail.page_id ? {page_id: detail.page_id} : {}), account_name: detail.account_name, status: detail.status, post_type: detail.post_type, id_type: 'scheduler_record_not_published_social_post'};
    scheduledCaptions[channel] = detail.text;
  }
  const execution = {
    status: 'scheduled', approved_by: 'Jon', approved_at: approvedAt,
    selected_channels: [...channels], selected_concept_id: entry.recommended_concept_id,
    scheduling_authorized: true, publication_authorized: true,
    authorization_scope: 'Facebook and Instagram feed only; automatic publication at the recorded target times.',
    scheduled_at: utc, scheduled_at_local: r.scheduled_at_local,
    scheduling_created_at: createdAt, scheduling_verified_at: verifiedAt,
    published_at: null, scheduler: 'AdaptlyPost', scheduler_post_id: r.post_id,
    platform_ids: ids, platform_urls: {}, actual_scheduled_captions: scheduledCaptions,
    scheduled_instagram_variant: 'alternate_caption_without_verified_bio_link',
    scheduling_receipt: receiptRef, scheduled_media: {url: r.media_url, sha256: r.sha256, alt_text: r.alt_text},
  };
  Object.assign(p, execution);
  Object.assign(row, execution, {copy_status: 'approved_and_scheduled', content_readiness: 'scheduled'});
  Object.assign(entry, execution, {scheduling_receipt: portableReceipt});
  Object.assign(localPost, entry, {scheduling_receipt: '../' + portableReceipt});
  const selected = [...c.concepts, ...c.alternative_concepts].find(item => item.id === entry.recommended_concept_id);
  if (selected) Object.assign(selected, execution);
  const group = c.creative_choice_groups.find(item => item.calendar_occasion_id === p.calendar_id);
  if (group) Object.assign(group, {selected_concept_id: entry.recommended_concept_id, approved_by: 'Jon', approved_at: approvedAt, selection_rule: 'This concept is selected and scheduled for the recorded feed occasion. Do not schedule its unselected alternative.'});
  writes.set(resolve(folder, 'post.json'), json(localPost));
  const text = `TWISTED PIN | ${entry.event_name.toUpperCase()}\nSCHEDULED POST: ${r.scheduled_at_local}\nSTATUS: Scheduled in AdaptlyPost for Facebook + Instagram feeds. Not yet published. Do not duplicate.\nANGLE: ${entry.headline}\nCOPY REVISION: ${c.copy_revision}\nAPPROVED BY: Jon\nVERIFIED: ${verifiedAt}\nADAPTLYPOST POST ID: ${r.post_id}\nRECEIPT: ../${portableReceipt}\n\nSCHEDULED FEED IMAGE\n${entry.assets.feed.filename}\n1080 x 1350 (4:5). Same image scheduled on both feeds.\n\nFACEBOOK — ACTUALLY SCHEDULED CAPTION\n\n${scheduledCaptions.facebook_feed}\n\nINSTAGRAM — ACTUALLY SCHEDULED CAPTION\nThe supplied plain-address fallback was used. It makes no unverified bio-link claim. A caption address is not a clickable link.\n\n${scheduledCaptions.instagram_feed}\n\nINSTAGRAM BIO-LINK VERSION — NOT SCHEDULED\nRetained only as an alternative for a separately authorized edit after verifying the bio destination.\n\n${entry.captions.instagram}\n\nOPTIONAL STORY — NOT SCHEDULED OR AUTHORIZED\nFile: ${entry.assets.story.filename}\n1080 x 1920 (9:16).\nMessage: ${entry.story.message}\nNative link sticker: ${entry.story.link_sticker.label}\nDestination: ${entry.story.link_sticker.url}\nDo not publish this companion without an additional instruction.\n\nBEFORE AUTOMATIC PUBLICATION\nReview opening phase, date-specific wording and relevant booking availability. If facts change, update or cancel the existing scheduled post; do not create another one. Actual app crop and Story overlay checks are distinct from scheduler acceptance.\n\nFEED IMAGE ALT TEXT\n${entry.assets.feed.alt_text}\n\nEVENT PAGE\n${entry.url}\n`;
  writes.set(resolve(folder, 'RECOMMENDED-COPY.txt'), text);
  prepared.push({p, r, entry});
}

const globalState = {status: 'scheduled', scheduling_authorized: true, publication_authorized: true, authorization_scope: scope, scheduling_created_at: createdAt, scheduling_verified_at: verifiedAt, scheduling_receipt: receiptRef};
Object.assign(c, globalState);
Object.assign(m, globalState, {scheduling_receipt: portableReceipt, accounts: receipt.accounts});
c.planning_revision.exact_editorial_dates = 'approved_and_scheduled_for_facebook_and_instagram_feeds';
c.copy_style.status = 'approved_feed_copy_scheduled';
c.delivery.status = 'scheduled';
c.delivery.source_note = 'All sixteen recommended feed visuals are selected and scheduled on Facebook and Instagram. Optional Stories and Google/SMS extras remain unscheduled and unauthorized.';
c.link_policy.scheduled_instagram = 'The complete plain-address fallback is the actual scheduled caption on every Instagram post. A clickable bio destination was not assumed.';
c.rules = c.rules.map(rule => {
  if (rule.startsWith('Dates/times proposed,')) return 'The sixteen feed dates/times are approved and scheduled. Reconcile later changes against AdaptlyPost; never duplicate an existing scheduled post.';
  if (rule.startsWith('Stories and Google/SMS extras')) return 'Stories and Google/SMS extras remain optional, unscheduled and unauthorized. Only facebook_feed and instagram_feed are selected.';
  if (rule.startsWith('Only ready_for_review')) return 'Scheduled entries retain their actual receipt and execution fields. Optional incomplete concepts must not be scheduled without separate preparation and authorization.';
  return rule;
});
const logId = 'adaptlypost-holiday-feed-scheduling';
const log = {id: logId, action: 'verified_feed_scheduling', verified_at: verifiedAt, scheduled_created_at: createdAt, approved_by: 'Jon', scope, receipt: receiptRef, accounts: receipt.accounts, posts: receipt.posts.map(r => ({calendar_id: r.calendar_id, scheduler_post_id: r.post_id, scheduled_at: r.scheduled_at_utc, platforms: r.platforms})), publication_observed: false};
c.execution_log = [...c.execution_log.filter(item => item.id !== logId), log];

const receiptNote = `16 feed occasions are scheduled on Facebook and Instagram in AdaptlyPost. Nothing is recorded as published. Do not schedule duplicates. Stories, Google/SMS/email and paid ads are not included.\nVerified: ${verifiedAt}\nReceipt: ${portableReceipt}\n`;
const regenerationNote = 'The review packagers intentionally reject scheduled campaign state. Do not reset authorization/execution fields to rerun them. Reproduce an old review only from a historical pre-scheduling commit in a separate checkout. Use this receipt recorder for durable scheduling records; it never reschedules anything.';
writes.set(resolve(out, 'SCHEDULING-RECEIPT.txt'), `TWISTED PIN | VERIFIED SCHEDULING RECEIPT\n\n${receiptNote}\nCreated: ${createdAt}\nApproved by Jon: ${approvedAt}\nApproval-time basis: ${receipt.authorization.approved_at_basis || 'Recorded in source receipt.'}\nScope: sixteen Facebook feed posts + sixteen Instagram feed posts. Parent records are SCHEDULED; each platform delivery is PENDING until its future publication time. These are scheduler IDs, not published social-post IDs or URLs.\n\n${prepared.map(({r, entry}) => `${entry.event_name} | ${r.scheduled_at_local}\n${entry.headline}\nParent: ${r.post_id}\nFacebook target: ${r.platforms.FACEBOOK.id} | page ${r.platforms.FACEBOOK.page_id}\nInstagram target: ${r.platforms.INSTAGRAM.id} | connection ${r.platforms.INSTAGRAM.connection_id}\nImage SHA-256: ${r.sha256}\nFolder: ${r.folder}\n`).join('\n')}\nInstagram uses the complete plain-address fallback; no bio-link destination is assumed. The JSON receipt retains exact captions, media URLs, alt text, accounts and verification details.\n\n${receipt.limitations.join('\n')}\n\nCONTACT-SHEET.png remains a visual review image made before scheduling; its earlier status wording is historical. This receipt and the manifests are current.\n`);
writes.set(resolve(out, 'START-HERE.txt'), `TWISTED PIN | HOLIDAY CAMPAIGN 2026\n\n${receiptNote}\nOpen START-HERE.html for images and actual scheduled captions. Each dated folder retains the feed image, optional unscheduled Story, RECOMMENDED-COPY.txt and post.json. The Instagram plain-address fallback is scheduled; the bio-link version is retained only as an unused alternative.\n\nScheduling metadata uses America/Chicago. Guest copy and graphics omit timezone labels.\n\nTo check or change a post, look up its existing AdaptlyPost ID from ${portableReceipt} or post.json. Check current opening phase, event-specific availability and relative wording before the target date; edit/cancel that existing post if needed. Do not add duplicate feed posts.\n\n${regenerationNote}\n\nSource: ${pack.replaceAll('\\', '/')}\nBranch: ${c.source_branch}\n`);
writes.set(resolve(out, 'POSTING-CALENDAR.txt'), `TWISTED PIN HOLIDAY CAMPAIGN 2026\n\n${receiptNote}\nAll scheduling times use America/Chicago.\n\n${prepared.map(({r, entry}) => `${r.scheduled_at_local} | ${entry.event_name}\n${entry.headline}\nChannels: Facebook feed + Instagram feed\nAdaptlyPost ID: ${r.post_id}\nFolder: ${r.folder}\n`).join('\n')}\nNYE reservations open November 18, 2026 at 9am; NYE event is December 31. Jingle Bowl is December 6.\n`);
writes.set(resolve(out, 'SCHEDULING-PROMPT.txt'), `Help me review or maintain this already scheduled Twisted Pin holiday campaign. Read my current instruction first.\n\n${receiptNote}\nRead START-HERE.txt, ${portableReceipt}, campaign-manifest.json and each relevant post.json. First reconcile the existing AdaptlyPost IDs/statuses with the service before taking any new action. The receipt proves scheduling acceptance and the recorded readback; it does not prove later publication or current inventory. Never silently create duplicate posts or catch up a missed date.\n\nJon authorized these sixteen Facebook and Instagram feed occasions to publish automatically at their recorded times. That existing approval persists; do not ask for it again. Other posts, Stories, Google/SMS/email and ad spending need separate instruction. No website/backend/Roy, production-data or payment changes are part of this campaign.\n\nActual scheduled captions are in actual_scheduled_captions and RECOMMENDED-COPY.txt. Instagram uses the supplied plain-address fallback, not an unverified bio-link claim. Facebook uses the canonical event-page URL. Keep guest timezone labels omitted and preserve internal America/Chicago/UTC timing.\n\nBefore each target date, check the opening phase, relative-date wording and relevant booking availability. NYE bookings open November 18, 2026 at 9am (15:00 UTC); December31 is the event. The midnight toast belongs only to the 10pm party. Jingle is December6 and promises a visit/photo with Santa, not bowling alongside him. If facts change, revise or cancel the existing scheduled item as authorized; do not invent scarcity.\n\n${regenerationNote}\n\nRecord actual platform publication URLs only after observing publication. Scheduler IDs are not published social-post IDs. Preserve failures and any later state.\n\nMy current instruction: [review or maintain specified existing posts]\n`);

let gallery = await readFile(resolve(out, 'START-HERE.html'), 'utf8');
const banner = `<p id="scheduled-campaign-status"><strong>All 16 feed occasions are scheduled on Facebook and Instagram. Do not duplicate.</strong> Nothing is recorded as published. Stories remain optional and unscheduled. <a href="SCHEDULING-RECEIPT.txt">Read the scheduling receipt</a> or <a href="${portableReceipt}">open the structured record</a>.</p>`;
if (gallery.includes('id="scheduled-campaign-status"')) gallery = gallery.replace(/<p id="scheduled-campaign-status">[\s\S]*?<\/p>/, banner);
else {
  const original = /<p>Dates are proposed in (?:local|Central) time\. <strong>Nothing is scheduled or published\.<\/strong>[\s\S]*?<\/p>/;
  if (!original.test(gallery)) throw Error('Unrecognized gallery status banner; no files written');
  gallery = gallery.replace(original, banner);
}
gallery = gallery.replace('recommended graphic and ready-to-copy Facebook/Instagram text', 'selected graphic and actual scheduled Facebook/Instagram text');
for (const {r, entry} of prepared) {
  const articlePattern = new RegExp(`(<article id="${r.calendar_id}"[\\s\\S]*?<details>)[\\s\\S]*?(</details>)`);
  if (!articlePattern.test(gallery)) throw Error('Gallery article missing: ' + r.calendar_id);
  const details = `<summary>Read the scheduled captions here</summary><p class="small-label">FACEBOOK · SCHEDULED</p><div class="caption">${esc(r.platforms.FACEBOOK.text)}</div><p class="small-label">INSTAGRAM · SCHEDULED PLAIN-ADDRESS VERSION</p><div class="caption">${esc(r.platforms.INSTAGRAM.text)}</div><p><strong>Story not scheduled:</strong> ${esc(entry.story.message)}</p><p><strong>Story link, only if separately authorized:</strong> <a href="${esc(entry.url)}">${esc(entry.url)}</a></p><p class="note">AdaptlyPost ID: ${esc(r.post_id)}. Target: ${esc(r.scheduled_at_local)}. <a href="${portableReceipt}">Verified receipt</a>. Do not duplicate this scheduled feed post.</p>`;
  gallery = gallery.replace(articlePattern, (_, before, after) => before + details + after);
}
writes.set(resolve(out, 'START-HERE.html'), gallery);
writes.set(resolve(out, portableReceipt), json(receipt));
writes.set(resolve(out, 'campaign-manifest.json'), json(m));
writes.set(resolve(pack, 'campaign.json'), json(c));
// Validate every receipt and prepare all outputs before the first file mutation.
for (const [path, text] of writes) await writeFile(path, text);
console.log(json({recorded_occasions: prepared.length, scheduled_platform_posts: prepared.length * 2, files_written: writes.size, verified_at: verifiedAt, receipt: receiptRef, network_calls: 0, images_changed: 0, publication_observed: false}));
