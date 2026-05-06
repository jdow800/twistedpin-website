# DNS Migration Runbook

Plan and reference for moving DNS authority off the dev company's
Cloudflare account, consolidating at GoDaddy, and pointing the
website at Vercel — all without dev-company cooperation.

Captured 2026-05-05 via public DNS audit (`Resolve-DnsName` against
`twistedpin.com` from a workstation). Update timestamps below as
records change.

---

## Current state (pre-cutover)

| Layer | Where it lives | Controlled by |
|---|---|---|
| Domain registrar | GoDaddy | Owner (you) |
| DNS authority | Cloudflare *(dev company's account: `peyton.ns.cloudflare.com`, `demi.ns.cloudflare.com`)* | Dev company |
| Website hosting | Unknown origin behind Cloudflare proxy *(IPs `104.26.14.126` etc. are Cloudflare anycast — origin is hidden)* | Dev company |
| Email hosting | Google Workspace | Owner |
| Customer-facing email tooling | Freshdesk | Owner *(via Freshdesk dashboard)* |

The registrar relationship is the trump card. DNS authority moves the
moment GoDaddy points nameservers somewhere else. The dev company has
no veto.

---

## Captured DNS records (2026-05-05)

These are the records you need to recreate in your new DNS host
(GoDaddy DNS recommended — already paid for, one fewer vendor).

### Email and auth (preserve as-is, except where noted)

| Type | Name | Value | Purpose |
|---|---|---|---|
| MX | `twistedpin.com` | `smtp.google.com` (priority 1) | Google Workspace email — new single-record format |
| TXT | `twistedpin.com` | `google-site-verification=_pgfrXHaLPR_h0TWvoBve5n9a_8v4zSQzyDWwIjh_pA` | Google Workspace ownership verification |
| TXT | `twistedpin.com` | **REWRITE — see SPF Cleanup below** | SPF — currently malformed |
| TXT | `_dmarc.twistedpin.com` | `v=DMARC1; p=quarantine; sp=quarantine; pct=100; aspf=r; adkim=r;` | DMARC anti-spoofing policy |
| TXT | `google._domainkey.twistedpin.com` | `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp++CgmswRN1jrAt9XcB7sTuSWVD8J9Cg/sZof1FioIWl4mC3o0r0VKW9BsPA68mOAzfurMqWpCIcU3WWecRbZuaDU8Sr6hXjRvmr9I5WVjnVtVuVBakrZucgn6RjsLasH3HEodItHTcsnjW8lUueGDWXYM0N/P6ILtR/GwBqvt/Z/xA5FHj6RsJZkjIct/OXOMp8NcSmwHghjXbr2rQLlzbq6hYmFOwlcX2sozTGRCNDnCj0DLa/YjfDjceI6vC2ZLf36Qz61njmMkvf9juhpQ7V4r6iBqfN8uDFLPhSCXZo/Nl8JvOlw8BCYPrcZ05dafxCNySTyuwhZu3hbYr2AQIDAQAB` | Google Workspace DKIM signing public key |
| CNAME | `zbdjb._domainkey.twistedpin.com` | `wl756589s1.domainkey.freshemail.io` | Freshdesk DKIM selector 1 |
| CNAME | `6r4zq._domainkey.twistedpin.com` | `wl756589s2.domainkey.freshemail.io` | Freshdesk DKIM selector 2 |
| CNAME | `1s3._domainkey.twistedpin.com` | `wl756589s3.domainkey.freshemail.io` | Freshdesk DKIM selector 3 |
| CNAME | `fwdkim1.twistedpin.com` | `spfmx1.domainkey.freshemail.io` | Freshdesk SPF macro |

### Website (NEW — point at Vercel during cutover)

| Type | Name | Value | Purpose |
|---|---|---|---|
| A | `twistedpin.com` *(apex)* | Vercel's apex IP — get exact value from Vercel dashboard when adding domain *(typically `76.76.21.21`)* | Website root |
| CNAME | `www.twistedpin.com` | `cname.vercel-dns.com` | Website www subdomain |

**Currently** the apex/www point at Cloudflare proxy IPs (`104.26.x.x`, `172.67.x.x`). Those go away with the dev company's Cloudflare zone — no need to recreate them.

---

## SPF cleanup (do this during the rebuild)

Current SPF record:

```
v=spf1 +a +mx +ip4:35.209.243.176 include:_spf.google.com include.com.spf.auto.dnssmarthost.net ~all
```

Issues:
- `include.com.spf.auto.dnssmarthost.net` is **missing the colon** — should be `include:com.spf.auto.dnssmarthost.net`. As-is, this token is malformed and may cause SPF parsers to throw `permerror`, which DMARC's `p=quarantine` would route to spam.
- `+ip4:35.209.243.176` is a Google Cloud IP, almost certainly the dev company's hosting server. After cutover, that IP no longer sends mail as `twistedpin.com` — drop it.
- `+a` and `+mx` are usually unnecessary when you have specific includes; they grant SPF-pass to anything matching the domain's `A` or `MX` records, which is broader than needed.

Recommended replacement (verify with your email-sending services first):

```
v=spf1 mx include:_spf.google.com include:freshemail.io ~all
```

Verify before publishing:
1. Paste `twistedpin.com` into [mxtoolbox.com SPF Check](https://mxtoolbox.com/spf.aspx) BEFORE the cutover to confirm the malformed token is actually causing errors today
2. Send a test email from `contactus@twistedpin.com` to a Gmail address and check the headers for `spf=` — if it's `softfail` or `temperror`, the current record is broken. If it's `pass`, leave well enough alone and move on
3. Confirm with Freshdesk support that `include:freshemail.io` is the correct include macro for their sending infrastructure (some platforms use a different domain — verify before relying on it)

---

## Cutover plan (single afternoon)

Order matters. The website goes from "served via dev company's Cloudflare" to "served via Vercel" at the moment nameservers flip. Email never moves — MX records get recreated as-is in the new zone.

### Step 1 — Prepare the Vercel side (do FIRST, before touching DNS)

1. Vercel project → Settings → Domains → Add `twistedpin.com` and `www.twistedpin.com`
2. Vercel will show you the exact `A` record IP and `CNAME` value to add. Capture them.
3. Vercel will say "domain not configured yet" — that's expected; we haven't pointed DNS yet.

### Step 2 — Build the new DNS zone in GoDaddy

1. GoDaddy account → Products → DNS → manage `twistedpin.com`
2. **Don't change nameservers yet.** Just enter the records below as a "draft" zone. GoDaddy lets you edit the zone before it's authoritative.
3. Recreate every record from the inventory above:
   - All email records (MX, TXT for SPF/DMARC/DKIM, Freshdesk CNAMEs)
   - **Apex `A` and `www` `CNAME` pointed at Vercel** *(per Step 1)*
4. **Apply the SPF cleanup** while you're entering — see SPF Cleanup section above.
5. Set TTL on the apex `A` and `www` `CNAME` to **300 seconds (5 min)** for the cutover. After 24h of stability, bump back to 3600+.

### Step 3 — Flip nameservers at GoDaddy registrar

1. GoDaddy account → My Products → `twistedpin.com` → Manage DNS → **Change Nameservers**
2. Switch from Cloudflare's (`peyton.ns.cloudflare.com` + `demi.ns.cloudflare.com`) to GoDaddy's defaults (`ns1.domaincontrol.com` + similar — GoDaddy fills these in for you when you select "GoDaddy DNS")
3. Save.

**This is the moment of cutover.** Resolvers around the world start picking up the new nameservers over the next 24-48h (typically <2h for most users, since the existing nameserver records have a default TTL).

### Step 4 — Verify

Within ~10-30 min, check from a different network (mobile data, not your office WiFi which may have cached):

| Check | How |
|---|---|
| Nameservers updated | `nslookup -type=NS twistedpin.com 8.8.8.8` — should show `ns1.domaincontrol.com` etc. |
| Website serves Vercel | Visit `twistedpin.com` — should be the new site |
| MX still resolves | `nslookup -type=MX twistedpin.com` — should still show `smtp.google.com` |
| DKIM still resolves | `nslookup -type=TXT google._domainkey.twistedpin.com` — should still show the long key |
| Email round-trip | Send `contactus@twistedpin.com` from Gmail; reply from Workspace; verify both arrive |
| Freshdesk works | Send a ticket via Freshdesk's normal flow; verify it arrives + outbound replies route properly |

If anything fails, you can revert in <5 min by changing nameservers back to Cloudflare's at GoDaddy registrar.

### Step 5 — Post-cutover

1. After 48h of stable operation, bump TTL on apex/www back to 3600+ (lower TTLs cost more queries; high TTLs are fine in steady state).
2. Send a polite email to the dev company saying "DNS has moved, please feel free to disable your Cloudflare zone and origin server for twistedpin.com." They have no leverage to negotiate at this point. They may have already noticed.
3. **Cancel any standing autopay / recurring invoice** with the dev company. Hosting they don't provide isn't worth a monthly bill.

---

## Risk mitigations

- **Backup before any change:** export the dev company's Cloudflare zone if you have view access. If not, the audit above IS your backup. Save this file.
- **TTL tuning:** the existing nameserver records have a TTL set by Cloudflare (typically 86400 = 24h). Most resolvers honor that. So during the first 24h after flip, some traffic will still resolve via the old (Cloudflare) nameservers. As long as both old and new zones serve identical records, this is fine — users get mixed traffic but neither version is broken.
- **Dev company hostility:** if they delete records in their Cloudflare zone before propagation completes, those queries return NXDOMAIN until the new nameservers take over for that resolver. This causes intermittent errors for some users for up to 24h. Mitigation: have your new zone ready and accurate BEFORE you flip nameservers — Step 2 must be complete before Step 3. The new zone takes over immediately for any resolver that's seen the new NS records, which most do within minutes.
- **Email bounces during transition:** unlikely, since MX records are typically cached at receiving mail servers for 24h+. As long as the new MX record matches the old one (both `smtp.google.com`), no perceived disruption.

---

## What does NOT need to happen

- No "transfer DNS" conversation with the dev company
- No "give me your zone export" ask
- No "add me to your Cloudflare account" ask
- No origin server IP needed (Vercel replaces it)
- No DNS-zone-transfer protocol (`AXFR`) work — that's an enterprise-secondary thing, not relevant here

---

## Open questions / follow-ups

- [ ] Confirm SPF record's malformed token is actually causing `permerror` today — run [mxtoolbox.com SPF Check](https://mxtoolbox.com/spf.aspx) before cutover
- [ ] Confirm `include:freshemail.io` is the correct SPF include for Freshdesk (verify with their docs / support)
- [ ] Note Vercel's exact apex IP value when domain is added — record here so this runbook is self-contained
- [ ] Identify any subdomains beyond `www` that need records (e.g. `events.twistedpin.com` for the Zite events platform when it deploys — currently NOT in the captured zone, will need a CNAME at cutover time)
- [ ] If Freshdesk dashboard shows the DKIM CNAMEs as "not verified" (red icons), confirm the records resolve correctly after the new zone goes live and re-verify in their dashboard
