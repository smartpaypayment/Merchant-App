/**
 * FAQ search for the Section 6.17 help screen.
 *
 * Kept out of the component so the matching rules can be tested directly — the
 * behaviour that matters (an answer-only hit still surfaces its question) is
 * invisible from a render assertion.
 */

export interface FaqEntry {
  index: number;
  /** Already-localized question text. */
  question: string;
  /** Already-localized answer text. */
  answer: string;
}

/**
 * Filters the FAQ list by a free-text query.
 *
 * Matches question **and** answer text, because the merchant's vocabulary is not
 * the FAQ's: someone searching "PIN" is looking for the refund answer that
 * mentions needing one, and that word never appears in the question.
 *
 * `toLocaleLowerCase` rather than `toLowerCase` since the corpus is localized —
 * the two differ for some scripts, and the FAQ is shown in eight languages.
 * Devanagari and the other Indic scripts here are caseless, so folding is a no-op
 * for them and the substring match carries the weight; it matters for the Latin
 * text that appears mixed into those translations (UPI, KYC, RBI).
 *
 * An empty or whitespace-only query returns everything rather than nothing: a
 * cleared search box should restore the full list, not empty it.
 */
export function filterFaqs<T extends FaqEntry>(faqs: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return [...faqs];

  return faqs.filter(
    (faq) =>
      faq.question.toLocaleLowerCase().includes(needle) ||
      faq.answer.toLocaleLowerCase().includes(needle),
  );
}
