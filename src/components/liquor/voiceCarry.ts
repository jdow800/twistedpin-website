/**
 * Carry-forward for pause-cut voice pieces. A counter's rhythm is "Name,
 * quantity." When a piece's last phrase is not a quantity ("…Baileys, two.
 * Frangelico,"), or is a quantity cut off at "point", that phrase waits and
 * leads the next piece, so the bottle meets its number. On 2026-10-02 the
 * counter paused after a bottle's name about as often as after its number: 8 to
 * 11 of 21 pause cuts fell between the two. In the replay, carrying them lifted
 * the pause design from 94 to 102 products right with Deepgram, and from 98 to
 * 107 with Grok (Alcohol Pricing/incidents/2026-10-02/stt-bakeoff).
 *
 * Liquor only. Food says "we have five boxes of gloves", product last, so this
 * rhythm would hold back every food phrase.
 */
const QUANTITY_WORDS = new Set(
  ("zero oh one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen " +
   "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand point " +
   "half a an and quarter quarters case cases cs bottle bottles can cans each").split(" "),
);

/** Held text longer than this goes out anyway, so a run with no punctuation
 *  can't hold back matching for the rest of the take. */
export const MAX_HELD_WORDS = 12;

const isQuantity = (phrase: string) =>
  phrase.split(/[\s-]+/).filter(Boolean).every((w) => QUANTITY_WORDS.has(w.toLowerCase()) || /^\d*\.?\d+$/.test(w));

/** Split a piece into what can be matched now (head) and an unfinished last
 *  phrase that should lead the next piece (tail). */
export function splitUnfinished(text: string): { head: string; tail: string } {
  // A comma, or a sentence end that isn't a decimal point ("1.1" stays whole).
  const marks = [...text.matchAll(/,|[.!?](?=\s|$)/g)].map((m) => m.index!);
  const bounds = [-1, ...marks, text.length];
  const phrases: { start: number; text: string }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const phrase = text.slice(bounds[i]! + 1, bounds[i + 1]).trim();
    if (phrase) phrases.push({ start: bounds[i]! + 1, text: phrase });
  }
  const last = phrases.at(-1);
  if (!last) return { head: text.trim(), tail: "" };
  let from: number | null = null;
  if (!isQuantity(last.text)) from = last.start;
  else if (/^(point|and|a)$/i.test(last.text.split(/\s+/).at(-1)!)) from = phrases.at(-2)?.start ?? last.start;
  if (from == null) return { head: text.trim(), tail: "" };
  const tail = text.slice(from).trim();
  if (tail.split(/\s+/).length > MAX_HELD_WORDS) return { head: text.trim(), tail: "" };
  return { head: text.slice(0, from).trim(), tail };
}

/**
 * Feeds pieces through splitUnfinished in SPOKEN order. Transcripts arrive in
 * the order they finish, so a piece waits for the one before it. `send` gets
 * each piece's matchable text under that piece's index; `flush` at Stop sends
 * whatever is left (pieces after a failed one, and the last held phrase).
 */
export function createCarry(send: (text: string, index: number) => void) {
  const waiting = new Map<number, string>();
  let next = 0;
  let held = "";
  const reset = () => {
    waiting.clear();
    held = "";
    next = 0;
  };
  return {
    add(text: string, index: number) {
      waiting.set(index, text);
      while (waiting.has(next)) {
        const { head, tail } = splitUnfinished(`${held} ${waiting.get(next)}`.trim());
        waiting.delete(next);
        held = tail;
        if (head) send(head, next);
        next++;
      }
    },
    /** Stop: everything still waiting, in order, as one last piece. */
    flush(lastIndex: number) {
      const rest = [...waiting.entries()].sort(([a], [b]) => a - b).map(([, t]) => t);
      const text = [held, ...rest].join(" ").trim();
      reset();
      if (text) send(text, lastIndex);
    },
    /** A new take starts at piece 0 with nothing held. */
    reset,
  };
}
