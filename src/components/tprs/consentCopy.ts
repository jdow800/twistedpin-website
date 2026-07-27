// The VERBATIM consent copy for the marketing opt-in, as evidence.
//
// ⚠️ TRIPWIRE: this string must stay a faithful transcription of what
// GuestDetailsStep.tsx actually RENDERS (box label + fine print + the `*`
// footnote). If you change the rendered copy there, change this in the SAME
// commit — the whole point is that consent_event.metadata.consent_language
// records exactly what the guest saw when they ticked the box. A drifted
// transcript is worse than none: it is confident wrong evidence.
//
// Sent on the checkout customer payload (consentLanguage) whenever a marketing
// decision is sent; the backend stamps it into the consent event alongside
// ip / user-agent / route / cart token (tprs PR #45).

/** The two rendered variants, keyed by whether the $10 reward card was shown. */
export function consentLanguageFor(rewardAmountCents: number | null): string {
  const footnote =
    "* Occasional marketing texts from Twisted Pin. Optional — not required " +
    "to book. Msg & data rates may apply. Reply STOP to opt out, HELP for " +
    "help. See Terms (twistedpin.com/terms) & Privacy (twistedpin.com/privacy).";
  if (rewardAmountCents != null && rewardAmountCents > 0) {
    const amt = `$${Math.round(rewardAmountCents / 100)}`;
    return (
      `${amt} OFF this reservation. Literally save ${amt} — plus the ` +
      `occasional epic offer by text.* [checkbox] Yes — ${amt} off & text me ` +
      `offers. ${footnote} The reward comes off this reservation's total, ` +
      `once per guest.`
    );
  }
  return (
    "[checkbox] Send me epic deals. Curated offers, you deserve.* " + footnote
  );
}
