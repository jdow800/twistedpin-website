export const prerender = false;

import type { APIRoute } from "astro";
import { CACHE_NONE, clientIp, corsHeaders, jsonResponse, originAllowed, parseAllowedOrigins, rateLimited } from "../../../lib/estimate/http.ts";
import { storeConfig } from "../../../lib/playbook-store";

/**
 * POST /api/estimate/track/  — the Event Builder's Calculate BEACON (Jon 2026-09-04).
 *
 * The price call (GET /api/estimate/) is edge-cached, so it cannot count presses.
 * On a LINKED page (menu.twistedpin.com/b/es|el/{eid}) Zite fires this beacon on
 * every successful Calculate with the eid, the inputs it priced, and the option +
 * total the guest is looking at. We log one row per press and bump six counters
 * on the event (Loyalty/db/081 `record_builder_calc`). The FIRST press for an
 * event also pings n8n, which posts a single one-line Missive note on the guest's
 * conversation; later presses only move the counters (no note spam - the count
 * lands on the Send note). Avery never reads any of this.
 *
 * Always answers fast and never with anything a guest could notice: a bad body,
 * an unknown eid, or a store failure is `ok:false` at 200 for the beacon's sake.
 */
const EID_RE = /^E-\d{7}$/;
const OPTION_RE = /^(vip|trad)[23]$/;
const CALC_NOTE_WEBHOOK = "https://n8n.twistedpin.com/webhook/builder-calc-note";

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: corsHeaders() });

export const POST: APIRoute = async ({ request }) => {
  const origin = request.headers.get("origin");
  if (!originAllowed(origin, parseAllowedOrigins(import.meta.env.ESTIMATE_ALLOWED_ORIGINS))) {
    return jsonResponse({ ok: false, code: "forbidden" }, 403, CACHE_NONE);
  }
  const ip = clientIp(request);
  if (rateLimited(ip)) return jsonResponse({ ok: false, code: "rate_limited" }, 429, CACHE_NONE);

  let body: any = null;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== "object") return jsonResponse({ ok: false, code: "invalid" }, 200, CACHE_NONE);

  const eid = typeof body.eid === "string" ? body.eid.trim() : "";
  if (!EID_RE.test(eid)) return jsonResponse({ ok: false, code: "invalid" }, 200, CACHE_NONE);
  const tier = body.tier === "es" || body.tier === "el" ? body.tier : null;
  const option = typeof body.option === "string" && OPTION_RE.test(body.option) ? body.option : null;
  const total = numOrNull(body.total);
  const deposit = numOrNull(body.deposit);
  const inputs = pickInputs(body.inputs);

  const cfg = storeConfig();
  if (!cfg) {
    console.error("[estimate/track] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    return jsonResponse({ ok: false, code: "not_configured" }, 200, CACHE_NONE);
  }

  let count = -1;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/record_builder_calc`, {
      method: "POST",
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_event_id: eid,
        p_tier: tier,
        p_option_key: option,
        p_inputs: inputs,
        p_total: total,
        p_deposit: deposit,
        p_ip_hash: await ipHash(ip),
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.error("[estimate/track] rpc failed", res.status, (await res.text()).slice(0, 300));
      return jsonResponse({ ok: false, code: "store_failed" }, 200, CACHE_NONE);
    }
    count = Number(await res.json());
  } catch (err) {
    console.error("[estimate/track] rpc error", err);
    return jsonResponse({ ok: false, code: "store_failed" }, 200, CACHE_NONE);
  }
  if (count < 1) return jsonResponse({ ok: false, code: "unknown_eid" }, 200, CACHE_NONE);

  // First press only: n8n reads the stored row and posts the one Missive note.
  // Best-effort with a short timeout; the log row is the record, the note is a convenience.
  if (count === 1) {
    try {
      await fetch(CALC_NOTE_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eid }),
        signal: AbortSignal.timeout(3000),
      });
    } catch (err) {
      console.warn("[estimate/track] calc-note webhook failed", err);
    }
  }
  return jsonResponse({ ok: true, count }, 200, CACHE_NONE);
};

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
}

/** Keep only the page's query fields, as short strings - nothing free-form lands in the log. */
function pickInputs(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of ["d", "t", "g", "f", "b", "bq", "a", "n"]) {
    const v = (raw as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim().slice(0, 200);
    if (s) out[k] = s;
  }
  return out;
}

async function ipHash(ip: string): Promise<string | null> {
  try {
    const data = new TextEncoder().encode("tp-calc:" + ip);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
