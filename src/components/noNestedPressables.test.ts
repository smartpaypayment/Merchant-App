import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static guard against nested pressables anywhere in the app.
 *
 * A `Pressable` inside another `Pressable` shipped once (the settlements row) and
 * is worth catching mechanically:
 *   - React Native Web maps `accessibilityRole="button"` to a real `<button>`, so
 *     nesting produces `<button>` inside `<button>` — invalid DOM.
 *   - Screen readers cannot describe an interactive control inside another one.
 *   - The touch targets overlap, so which handler wins is incidental.
 *
 * The detector is a deliberately simple tag-depth scan rather than a real parser.
 * It is validated against fixtures below — including the exact shape of the bug it
 * exists to prevent — so a future change to the detector cannot silently stop
 * working.
 */

const PRESSABLE_TAGS = ['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback'];

/**
 * Locates the end of a JSX opening tag starting at `<`.
 *
 * A naive `[^>]*` scan is wrong here: JSX props routinely contain `>` inside
 * expressions — `onPress={() => close()}` being the common case — which makes a
 * self-closing tag look like an open one and produces false positives. So this
 * walks the tag tracking brace depth and string literals, and only accepts a `>`
 * at brace depth 0.
 */
function findTagEnd(source: string, startIndex: number): { endIndex: number; selfClosing: boolean } | null {
  let braceDepth = 0;
  let quote: string | null = null;

  for (let i = startIndex; i < source.length; i += 1) {
    const ch = source[i]!;

    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth -= 1;
    else if (ch === '>' && braceDepth === 0) {
      // Self-closing if the last non-whitespace character before `>` is `/`.
      const selfClosing = /\/\s*$/.test(source.slice(startIndex, i));
      return { endIndex: i, selfClosing };
    }
  }

  return null;
}

/**
 * Returns the 1-based line numbers where a pressable opens while another is
 * already open.
 *
 * Only pressable tags affect the depth count — intervening `View`s and friends are
 * irrelevant, since what matters is whether one press handler encloses another.
 */
export function findNestedPressables(source: string): number[] {
  const findings: number[] = [];
  let openCount = 0;

  const tagStart = new RegExp(`<(/?)(${PRESSABLE_TAGS.join('|')})\\b`, 'g');

  let match: RegExpExecArray | null;
  while ((match = tagStart.exec(source)) !== null) {
    const isClosingTag = match[1] === '/';

    if (isClosingTag) {
      openCount = Math.max(0, openCount - 1);
      continue;
    }

    const tag = findTagEnd(source, match.index);
    if (!tag) break;

    // A pressable opening while one is already open is the violation — whether or
    // not it is self-closing.
    if (openCount > 0) findings.push(lineOf(source, match.index));
    if (!tag.selfClosing) openCount += 1;

    // Resume after the tag so props containing `<` cannot confuse the next match.
    tagStart.lastIndex = tag.endIndex;
  }

  return findings;
}

const lineOf = (source: string, index: number): number => source.slice(0, index).split('\n').length;

/* -------------------------------------------------------------------------- */
/* Detector validation                                                        */
/* -------------------------------------------------------------------------- */

describe('findNestedPressables detector', () => {
  it('flags the exact shape of the bug it exists to prevent', () => {
    // The original settlements row: an action button inside a pressable card.
    const source = `
      <Pressable onPress={openDetail}>
        <View><Text>batch</Text></View>
        <Pressable onPress={settleNow}>
          <Text>Settle now</Text>
        </Pressable>
      </Pressable>`;

    expect(findNestedPressables(source)).toHaveLength(1);
  });

  it('accepts sibling pressables inside a plain View', () => {
    const source = `
      <View>
        <Pressable onPress={a}><Text>A</Text></Pressable>
        <Pressable onPress={b}><Text>B</Text></Pressable>
      </View>`;

    expect(findNestedPressables(source)).toEqual([]);
  });

  it('accepts pressables in mutually exclusive branches', () => {
    const source = `
      <View>
        {cond ? <Pressable onPress={a}><Text>A</Text></Pressable> : null}
        {!cond ? <Pressable onPress={b}><Text>B</Text></Pressable> : null}
      </View>`;

    expect(findNestedPressables(source)).toEqual([]);
  });

  it('handles a self-closing pressable', () => {
    expect(findNestedPressables('<View><Pressable style={s} /></View>')).toEqual([]);
    expect(findNestedPressables('<Pressable a={1}><Pressable b={2} /></Pressable>')).toHaveLength(1);
  });

  it('flags a nested Touchable variant', () => {
    const source = '<Pressable><TouchableOpacity onPress={x}><Text>x</Text></TouchableOpacity></Pressable>';
    expect(findNestedPressables(source)).toHaveLength(1);
  });

  it('is not fooled by a > inside an arrow function prop', () => {
    // The flaw that made the first version of this detector report false
    // positives: `=>` contains a `>`, which a naive `[^>]*` scan treats as the
    // end of the tag, making a self-closing backdrop look like an open element.
    const source = `
      <View>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <Pressable onPress={() => select(item)}>
            <Text>option</Text>
          </Pressable>
        </View>
      </View>`;

    expect(findNestedPressables(source)).toEqual([]);
  });

  it('is not fooled by a comparison operator in a prop', () => {
    const source = `
      <View>
        <Pressable disabled={count > 3} onPress={go} />
        <Pressable disabled={a >= b} onPress={go} />
      </View>`;

    expect(findNestedPressables(source)).toEqual([]);
  });

  it('still flags nesting when props contain arrow functions', () => {
    const source = `
      <Pressable onPress={() => outer()}>
        <Pressable onPress={() => inner()} />
      </Pressable>`;

    expect(findNestedPressables(source)).toHaveLength(1);
  });

  it('handles a multi-line opening tag with props', () => {
    const source = `
      <Pressable
        onPress={outer}
        accessibilityRole="button"
      >
        <Pressable
          onPress={inner}
        >
          <Text>x</Text>
        </Pressable>
      </Pressable>`;

    expect(findNestedPressables(source)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* The actual codebase scan                                                   */
/* -------------------------------------------------------------------------- */

function collectTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsxFiles(full, out);
    } else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('codebase', () => {
  it('has no nested pressables in any screen or component', () => {
    const files = collectTsxFiles(join(__dirname, '..'));
    expect(files.length).toBeGreaterThan(20);

    const offenders = files
      .map((file) => ({ file, lines: findNestedPressables(readFileSync(file, 'utf8')) }))
      .filter(({ lines }) => lines.length > 0)
      .map(({ file, lines }) => `${file.replace(/^.*\/src\//, 'src/')}:${lines.join(',')}`);

    expect(offenders).toEqual([]);
  });
});
