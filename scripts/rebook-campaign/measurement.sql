-- ============================================================================
-- LANE REBOOK CAMPAIGN — MEASUREMENT QUERIES
-- Built 2026-07-27 alongside n8n WF-Lane-Rebook-Campaign (SRMB0xdrcKmZuigE).
-- Run against the twistedpin-platform Supabase project (hdcoyqlskurvpjfrlnop).
--
-- The campaign is SELF-BENCHMARKING: every daily slice keeps a random no-offer
-- holdout (deterministic phone-hash bucket). Query 3 is the one that matters —
-- it answers "did the offer cause bookings that would not have happened?"
-- Never quote external win-back benchmarks; all published ones failed
-- adversarial verification (spec §4).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-cohort funnel from the ledger (assignment → sent/failed/skipped).
--    'queued' rows older than a day = enqueued but never drained (investigate).
-- ----------------------------------------------------------------------------
SELECT l.notes::jsonb->>'cohort' AS cohort,
       l.touch, l.status, count(*) AS guests
FROM avery_campaign_log l
WHERE l.campaign_type = 'lane_rebook'
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- ----------------------------------------------------------------------------
-- 2. Per-cohort redemption economics. v_campaign_results already carries the
--    discount arm: kind='discount', name='Lane Rebook <date>', reached = codes
--    issued, redemptions, discount_cents. /admin/discounts shows the same live.
-- ----------------------------------------------------------------------------
SELECT name, campaign_date, reached AS codes_issued, redemptions,
       round(discount_cents / 100.0, 2) AS discount_dollars
FROM v_campaign_results
WHERE kind = 'discount' AND name LIKE 'Lane Rebook %'
ORDER BY campaign_date DESC;

-- ----------------------------------------------------------------------------
-- 3. THE HOLDOUT COMPARISON — incremental rebook rate at 30 days.
--    Offer arm counts only guests whose offer actually SENT; holdouts count
--    unconditionally (they were assigned, nothing was ever sent to them).
--    A "rebook" = any real deposit-paid+ booking created after assignment,
--    matched by phone across every customer row sharing it (same person-key
--    the campaign itself uses). Change the '30 days' horizon to taste; also
--    run at 60/90 once cohorts mature — this is a planned group night, the
--    cycle is long.
-- ----------------------------------------------------------------------------
WITH cohort AS (
  SELECT l.contact_id, l.created_at AS assigned_at,
         CASE WHEN l.touch = 'offer' THEN 'offer' ELSE 'holdout' END AS arm,
         right(regexp_replace(coalesce(c.phone,''),'\D','','g'),10) AS phone10
  FROM avery_campaign_log l
  JOIN customers c ON c.id = l.contact_id
  WHERE l.campaign_type = 'lane_rebook'
    AND ((l.touch = 'offer' AND l.status = 'sent') OR l.touch = 'holdout')
),
outcomes AS (
  SELECT co.arm, co.phone10, co.assigned_at,
         EXISTS (
           SELECT 1 FROM bookings b
           JOIN customers bc ON bc.id = b.customer_id
           WHERE right(regexp_replace(coalesce(bc.phone,''),'\D','','g'),10) = co.phone10
             AND b.block_kind IS NULL
             AND b.status::text IN ('deposit_paid','fully_paid','completed')
             AND b.created_at >  co.assigned_at
             AND b.created_at <= co.assigned_at + interval '30 days'
         ) AS rebooked_30d
  FROM cohort co
  WHERE co.assigned_at <= now() - interval '30 days'   -- only mature assignments
)
SELECT arm,
       count(*) AS guests,
       count(*) FILTER (WHERE rebooked_30d) AS rebooked_30d,
       round(100.0 * count(*) FILTER (WHERE rebooked_30d) / nullif(count(*), 0), 1) AS rebook_rate_pct
FROM outcomes
GROUP BY arm
ORDER BY arm;
-- Read: offer-arm rate minus holdout rate = incremental lift. With ~15%
-- holdout and small daily cohorts the holdout cell fills slowly — judge lift
-- on pooled months, not single cohorts.

-- ----------------------------------------------------------------------------
-- 4. Redemption detail — which guests, which codes, what the booking became.
-- ----------------------------------------------------------------------------
SELECT d.name AS cohort, dc.code,
       dr.redeemed_email, dr.redeemed_phone,
       round(dr.discount_amount_cents / 100.0, 2) AS discount_dollars,
       dr.redeemed_at, b.invoice_number, b.status AS booking_status
FROM discount_redemption dr
JOIN discount_codes dc ON dc.id = dr.discount_code_id
JOIN discounts d       ON d.id  = dc.discount_id
LEFT JOIN bookings b   ON b.id  = dr.booking_id
WHERE d.name LIKE 'Lane Rebook %'
ORDER BY dr.redeemed_at DESC;

-- ----------------------------------------------------------------------------
-- 5. Reminder effectiveness — offers whose redemption landed AFTER the T-2
--    reminder sent (the pre-expiry regret spike the reminder exists to catch).
-- ----------------------------------------------------------------------------
SELECT count(*) FILTER (WHERE r.log_id IS NOT NULL)                                   AS offers_with_reminder,
       count(*) FILTER (WHERE r.log_id IS NOT NULL AND dr.redeemed_at > r.sent_at)    AS redeemed_after_reminder,
       count(*) FILTER (WHERE dr.id IS NOT NULL)                                      AS redeemed_total
FROM avery_campaign_log o
LEFT JOIN avery_campaign_log r
       ON r.log_id = o.log_id || '-R' AND r.status = 'sent'
LEFT JOIN discount_codes dc ON dc.code = o.notes::jsonb->>'code'
LEFT JOIN discount_redemption dr ON dr.discount_code_id = dc.id
WHERE o.campaign_type = 'lane_rebook' AND o.touch = 'offer' AND o.status = 'sent';

-- ----------------------------------------------------------------------------
-- 6. Safety watch — run after every first-week-of-sends. STOP/opt-out events
--    from campaign recipients, and delivery failures. A rising STOP rate is
--    the carrier-score canary (drip cap exists exactly for this).
-- ----------------------------------------------------------------------------
SELECT ce.action, ce.source, count(*)
FROM consent_event ce
WHERE ce.channel = 'sms'
  AND ce.occurred_at > now() - interval '14 days'
  AND ce.customer_id IN (SELECT contact_id FROM avery_campaign_log WHERE campaign_type = 'lane_rebook')
GROUP BY 1, 2 ORDER BY 3 DESC;
