import { z } from 'zod';
import { createEndpoint, ZiteError } from 'zitejs/backend';
import { Email } from 'zitejs/email';

import { canonicalBuild, daysAway, pricingContractError, RECALCULATE_MESSAGE } from '../lib/builderContract';

export default createEndpoint({
  description: 'Sends a formatted email to info@twistedpin.com when a walk-in guest submits from /eventmenu',
  inputSchema: z.object({
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string(),
    email: z.string(),
    date: z.string(),
    time: z.string(),
    duration: z.number(),
    guestCount: z.number(),
    laneType: z.enum(['vip', 'traditional']),
    foodPackage: z.string().nullable(),
    foodPackageSlug: z.string().nullable().optional(),
    foodEstimate: z.string(),
    barSelection: z.string(),
    barQty: z.number(),
    addons: z.array(z.object({ label: z.string(), slug: z.string().optional(), qty: z.number() })),
    notes: z.string(),
    estimateTotal: z.string(),
    pricing_status: z.enum(['estimate_shown', 'manual_quote_required']).optional(),
    manual_reason: z.enum(['custom_event', 'estimate_unavailable']).optional(),
    submitted_at: z.string().optional(),
    estimate: z.object({
      total: z.number(), deposit: z.number(), lane_label: z.string(), input_fingerprint: z.string().optional(),
    }).nullable().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const build = canonicalBuild({
      ...input, foodPackageSlug: input.foodPackageSlug ?? null,
      addons: input.addons.map(a => ({ slug: a.slug ?? '', qty: a.qty })),
    });
    const validation = pricingContractError({ ...build, ...input, event: build.event });
    if (validation) throw new ZiteError({ code: 'BAD_REQUEST', message: validation, userFacingMessage: validation });
    if (input.pricing_status === 'estimate_shown' && input.estimateTotal !== '$' + input.estimate!.total.toLocaleString('en-US')) {
      throw new ZiteError({ code: 'BAD_REQUEST', message: RECALCULATE_MESSAGE, userFacingMessage: RECALCULATE_MESSAGE });
    }
    if (input.pricing_status === 'manual_quote_required' && (input.estimateTotal || input.foodEstimate)) {
      throw new ZiteError({ code: 'BAD_REQUEST', message: RECALCULATE_MESSAGE, userFacingMessage: RECALCULATE_MESSAGE });
    }
    const shortNotice = (daysAway(input.date) ?? 365) < 10;
    const laneLabel = input.laneType === 'vip' ? 'VIP Suite' : 'Traditional Lanes';
    const fullName = `${input.firstName} ${input.lastName}`;

    // Format date
    let dateStr = input.date;
    if (input.date) {
      const dt = new Date(input.date + 'T12:00:00');
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      dateStr = `${days[dt.getDay()]} ${months[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
    }

    // Short date for subject
    let shortDate = input.date;
    if (input.date) {
      const dt = new Date(input.date + 'T12:00:00');
      const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      shortDate = `${shortDays[dt.getDay()]} ${months[dt.getMonth()]} ${dt.getDate()}`;
    }

    // Format time
    let timeStr = input.time;
    if (input.time && input.time !== '__outside__') {
      const [hStr, m] = input.time.split(':');
      let h = parseInt(hStr, 10);
      if (h >= 24) h -= 24;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      timeStr = `${h12}:${m} ${ampm}`;
    } else if (input.time === '__outside__') {
      timeStr = 'Outside regular hours';
    }

    // Bar label
    let barLabel = 'None';
    if (input.barSelection === 'own_tab') barLabel = 'Guests run their own tabs';
    else if (input.barSelection === '10_card') barLabel = `$10 Beer Wall Cards × ${input.barQty}`;
    else if (input.barSelection === '15_card') barLabel = `$15 Beer Wall Cards × ${input.barQty}`;
    else if (input.barSelection === 'individual') barLabel = 'Not sure yet';

    // Food line
    const foodLine = `${input.foodPackage ?? 'None selected'}${input.foodEstimate ? ` (${input.foodEstimate})` : ''}`;

    // Add-ons
    const activeAddons = input.addons.filter(a => a.qty > 0);
    const addonLines = activeAddons
      .map(a => `• ${a.label}${a.qty > 1 ? ` × ${a.qty}` : ''}`)
      .join('\n');

    // Guests line
    const guestStr = `${input.guestCount > 100 ? '100+' : input.guestCount} (guest-estimated · ${laneLabel})`;

    // Timestamp
    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });

    // Build email body using supported blocks
    const body: Array<
      | { type: 'text'; content: string }
      | { type: 'divider'; borderColor?: string }
      | { type: 'spacer'; height: number }
      | { type: 'button'; label: string; href: string; alignment?: 'left' | 'center' | 'right' }
    > = [];

    // Header
    body.push({ type: 'text', content: `🎳 **New event menu submission**\nWalk-in builder · needs a callback` });

    body.push({ type: 'divider' });

    // Guest contact
    body.push({
      type: 'text',
      content: `**GUEST**\n\n**${fullName}**\nPhone: ${input.phone}\nEmail: ${input.email}`,
    });

    body.push({ type: 'divider' });

    // Event details
    body.push({
      type: 'text',
      content: `**EVENT**\n\nDate: ${dateStr}\nTime: ${timeStr}\nDuration: ${input.duration} hours\nGuests: ${guestStr}`,
    });

    body.push({ type: 'divider' });

    // Menu selections
    let menuContent = `**MENU**\n\nFood: ${foodLine}\nDrinks: ${barLabel}`;
    if (addonLines) {
      menuContent += `\n\nAdd-Ons:\n${addonLines}`;
    }
    body.push({ type: 'text', content: menuContent });

    // Notes
    if (input.notes) {
      body.push({ type: 'divider' });
      body.push({ type: 'text', content: `**Notes**\n${input.notes}` });
    }

    // New clients carry numeric evidence bound to canonical selections.
    body.push({ type: 'spacer', height: 12 });
    if (input.pricing_status === 'estimate_shown') {
      body.push({ type: 'text', content: '**Estimate shown and submitted: About $' + input.estimate!.total.toLocaleString('en-US') +
        (shortNotice ? '\n\nPublic request: staff follow-up required. Confirm availability, final headcount and full payment at booking.' : '\n\nSubject to availability confirmation.') });
      body.push({ type: 'text', content: 'Estimate fingerprint: ' + input.estimate!.input_fingerprint +
        '\nGuest submitted: ' + input.submitted_at +
        '\nNumeric estimate total: ' + input.estimate!.total + '\nNumeric deposit field: ' + input.estimate!.deposit +
        (shortNotice ? '\nDeposit is estimate data only. Accepted short-notice catered events require full payment of the total at booking.' : '') });
    } else if (input.pricing_status === 'manual_quote_required') {
      body.push({ type: 'text', content: '**Manual quote request — no event estimate was shown/submitted.**\nReason: ' +
        input.manual_reason + (shortNotice ? '\nPublic short-notice request: staff follow-up required. Full payment and final headcount are required at booking.' : '') + '\nGuest submitted: ' + input.submitted_at });
    } else if (input.estimateTotal) {
      body.push({ type: 'text', content: '**Legacy builder estimate (unverified): About ' + input.estimateTotal + '**' });
    }

    // Call button
    body.push({ type: 'spacer', height: 8 });
    body.push({ type: 'button', label: `Call ${input.firstName}`, href: `tel:${input.phone}`, alignment: 'left' as const });

    // Footer
    body.push({ type: 'spacer', height: 8 });
    body.push({ type: 'text', content: `Submitted via /eventmenu walk-in builder · ${now}` });

    await Email.send({
      to: 'info@twistedpin.com',
      subject: `New event menu — ${fullName}, ${shortDate}`,
      body,
    });

    return { ok: true };
  },
});
