/**
 * Shared Lucide icon path data — single source for the SiteHeader MORE
 * dropdown, the mobile NavDrawer, and any future surface that needs
 * brand-coherent icons. Hoisted from the duplicated ICON_PATHS records
 * in SiteHeader.astro and NavDrawer.astro on 2026-05-04 (rule of three
 * triggered by the mobile drawer rebuild adding a third use).
 *
 * Lucide stroke conventions: 24x24 viewBox, 2px stroke, round caps +
 * joins, fill="none". When rendered as <svg> the consumer sets the
 * attributes; this file only exports the inner <path>/<rect>/<line>
 * markup.
 */

export type IconKey =
  // Pillar pages
  | 'martini'        // Bar
  | 'utensils'       // Eat (utensils-crossed)
  | 'book-open'      // Menu (cocktails / taps / food hub)
  | 'bowling-ball'   // Bowl (hand-drawn — Lucide doesn't ship one)
  | 'bowling-pin'    // Brand mark; kept for any future use (was Bowl pre-2026-05-04)
  | 'gamepad'        // Game (gamepad-2)
  | 'calendar'       // Events (calendar-days)
  | 'crown'          // VIP Suite
  // CTAs / actions
  | 'calendar-check' // Reserve a Lane (booking confirmation)
  | 'message-square' // Plan an Event (inquiry)
  // MORE / drawer items
  | 'ticket'         // Coupon
  | 'clock'          // Waitlist
  | 'trophy'         // Leagues
  | 'star'           // Rewards
  | 'gift'           // Gift Cards
  | 'help'           // FAQ (circle-help)
  | 'mail'           // Contact (when label says Contact)
  | 'briefcase'      // Careers
  | 'map-pin'        // Find Us
  | 'tag'            // Pricing
  | 'heart-handshake' // Fundraisers (community + giving)
  | 'cake'           // Birthday Parties
  // Seasonal
  | 'sparkles'       // NYE / festive seasonal items
  // UI utilities
  | 'chevron-down';  // Expand/collapse on accordion sections

export const ICON_PATHS: Record<IconKey, string> = {
  // lucide.dev/icons/martini
  'martini': '<path d="M8 22h8"/><path d="M12 11v11"/><path d="m19 3-7 8-7-8Z"/>',

  // lucide.dev/icons/utensils-crossed
  'utensils': '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/>',

  // lucide.dev/icons/book-open
  'book-open': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',

  // hand-drawn bowling ball (Lucide doesn't ship one). Big circle =
  // ball outline; three small circles in upper-left quadrant = the
  // standard 3-finger drilling layout. All stroked (no fill) so the
  // holes read as detail dots rather than face-features.
  'bowling-ball': '<circle cx="12" cy="12" r="9"/><circle cx="9.5" cy="9.5" r="1"/><circle cx="12.5" cy="9" r="1"/><circle cx="10.5" cy="12.5" r="1"/>',

  // hand-drawn bowling pin (Lucide doesn't ship one) — used for Bowl
  // pre-2026-05-04, replaced by bowling-ball. Kept in the library as
  // the Twisted Pin brand mark for any future "the Pin" reference.
  'bowling-pin': '<path d="M12 3a3 3 0 0 0-3 3v1.5a3 3 0 0 1-.7 1.95C6.6 11.5 6 13.6 6 16c0 3 2.5 5 6 5s6-2 6-5c0-2.4-.6-4.5-2.3-6.55A3 3 0 0 1 15 7.5V6a3 3 0 0 0-3-3z"/><path d="M9.5 8h5"/><path d="M9 10h6"/>',

  // lucide.dev/icons/gamepad-2
  'gamepad': '<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>',

  // lucide.dev/icons/calendar-days
  'calendar': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',

  // lucide.dev/icons/crown
  'crown': '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',

  // lucide.dev/icons/calendar-check
  'calendar-check': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',

  // lucide.dev/icons/message-square
  'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',

  // lucide.dev/icons/ticket
  'ticket': '<path d="M2 9a3 3 0 1 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',

  // lucide.dev/icons/clock
  'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',

  // lucide.dev/icons/trophy
  'trophy': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',

  // lucide.dev/icons/star
  'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',

  // lucide.dev/icons/gift
  'gift': '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1-2.5-2.5C5 4.12 6.5 3 8 3s4 5 4 5"/><path d="M16.5 8a2.5 2.5 0 0 0 2.5-2.5C19 4.12 17.5 3 16 3s-4 5-4 5"/>',

  // lucide.dev/icons/circle-help
  'help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',

  // lucide.dev/icons/mail
  'mail': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',

  // lucide.dev/icons/briefcase
  'briefcase': '<rect width="20" height="14" x="2" y="6" rx="2"/><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',

  // lucide.dev/icons/map-pin
  'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',

  // lucide.dev/icons/tag
  'tag': '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',

  // lucide.dev/icons/heart-handshake
  'heart-handshake': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/>',

  // lucide.dev/icons/cake (birthday cake with three candles)
  'cake': '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/>',

  // lucide.dev/icons/sparkles
  'sparkles': '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',

  // lucide.dev/icons/chevron-down
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
};
