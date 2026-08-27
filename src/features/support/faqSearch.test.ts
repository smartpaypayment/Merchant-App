import { filterFaqs, type FaqEntry } from './faqSearch';
import { resources, SUPPORTED_LANGUAGE_CODES } from '@localization/resources';

/**
 * The FAQ filter, plus a check that the shipped FAQ corpus is actually findable.
 *
 * The second half matters more than it looks: a perfectly correct filter over a
 * corpus that never mentions the word a merchant would type is still a dead
 * search box.
 */

const ENTRIES: FaqEntry[] = [
  { index: 1, question: 'When will I get my money?', answer: 'Next working day, under Settlements.' },
  { index: 2, question: 'Can someone else collect for me?', answer: 'Yes — add a cashier under Staff.' },
  { index: 3, question: 'How do I return money?', answer: 'Tap Refund. You will need your app PIN.' },
];

describe('filterFaqs', () => {
  it('returns every entry for an empty query', () => {
    expect(filterFaqs(ENTRIES, '')).toHaveLength(3);
  });

  it('returns every entry for a whitespace-only query', () => {
    // A cleared box should restore the list, not empty it.
    expect(filterFaqs(ENTRIES, '   ')).toHaveLength(3);
  });

  it('matches on question text', () => {
    const result = filterFaqs(ENTRIES, 'money');
    expect(result.map((f) => f.index)).toEqual([1, 3]);
  });

  it('matches on answer text when the question does not contain the term', () => {
    // "PIN" appears only in answer 3 — the reason the filter reads answers at all.
    const result = filterFaqs(ENTRIES, 'PIN');
    expect(result.map((f) => f.index)).toEqual([3]);
  });

  it('ignores case in both directions', () => {
    expect(filterFaqs(ENTRIES, 'REFUND').map((f) => f.index)).toEqual([3]);
    expect(filterFaqs(ENTRIES, 'settlements').map((f) => f.index)).toEqual([1]);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(filterFaqs(ENTRIES, '  cashier  ').map((f) => f.index)).toEqual([2]);
  });

  it('returns nothing for a term that appears nowhere', () => {
    expect(filterFaqs(ENTRIES, 'chargeback')).toEqual([]);
  });

  it('does not mutate or alias the input array', () => {
    const result = filterFaqs(ENTRIES, '');
    result.pop();
    expect(ENTRIES).toHaveLength(3);
  });
});

describe('shipped FAQ corpus', () => {
  /** Reads `support.faq.q1..q6` / `a1..a6` out of a language bundle. */
  const entriesFor = (code: string): FaqEntry[] => {
    const faq = resources[code as keyof typeof resources].translation.support.faq as Record<
      string,
      string
    >;

    return [1, 2, 3, 4, 5, 6].map((index) => ({
      index,
      question: faq[`q${index}`] ?? '',
      answer: faq[`a${index}`] ?? '',
    }));
  };

  it.each(SUPPORTED_LANGUAGE_CODES)('%s ships six complete question/answer pairs', (code) => {
    for (const entry of entriesFor(code)) {
      expect(entry.question.length).toBeGreaterThan(0);
      expect(entry.answer.length).toBeGreaterThan(0);
    }
  });

  // Terms a merchant would plausibly type, each verified to exist in the corpus.
  it.each(['refund', 'KYC', 'settlement', 'bank'])(
    'finds an English answer for the common search term "%s"',
    (term) => {
      expect(filterFaqs(entriesFor('en'), term).length).toBeGreaterThan(0);
    },
  );

  it('surfaces the settlement-timing answer when searching "money"', () => {
    const result = filterFaqs(entriesFor('en'), 'money');
    expect(result.some((f) => f.index === 1)).toBe(true);
  });
});
