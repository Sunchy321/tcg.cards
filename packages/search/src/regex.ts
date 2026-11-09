/** Describes substring facts within one text field, never across different sources. */
export type TextCondition
  = | { kind: 'contains', value: string }
    | { kind: 'and' | 'or', exprs: TextCondition[] };

/** Distinguishes equivalent matching, necessary matching, and unsupported syntax. */
export type RegexAnalysis
  = | { type: 'exact' | 'candidate', condition: TextCondition }
    | { type: 'original', reason: string };

/** Retains the existing text handler's conversion, including its historical escaping behavior. */
export function pgRegexSource(source: string): string {
  return source.replace(/\\b/g, '\\y').replace(/([*+?])\?/g, '$1');
}

/** Represents only syntax whose substring implications are known under PG ARE rules. */
type Node
  = | { kind: 'literal', value: string }
    | { kind: 'unknown' }
    | { kind: 'sequence' | 'choice', children: Node[] }
    | { kind: 'repeat', child: Node, min: number };

/** Parses a deliberately bounded whitelist; unknown syntax invalidates the entire analysis. */
class RegexParser {
  private index = 0;
  private depth = 0;

  /** Binds the effective pattern sent to PostgreSQL. */
  constructor(private readonly source: string) {}

  /** Reads the complete pattern so no unknown tail can escape validation. */
  parse(): Node {
    const node = this.choice();
    if (this.index !== this.source.length) {
      throw new Error('Unsupported regex syntax.');
    }
    return node;
  }

  /** Preserves all alternatives, including empty branches. */
  private choice(): Node {
    if (++this.depth > 32) {
      throw new Error('Regex nesting exceeds the analysis budget.');
    }
    const children = [this.sequence()];
    while (this.source[this.index] === '|') {
      this.index++;
      children.push(this.sequence());
    }
    this.depth--;
    return children.length === 1 ? children[0]! : { kind: 'choice', children };
  }

  /** Attaches quantifiers before coalescing adjacent literal characters. */
  private sequence(): Node {
    const children: Node[] = [];
    while (this.index < this.source.length && !['|', ')'].includes(this.source[this.index]!)) {
      let node = this.atom();
      const quantifier = this.source[this.index];
      if (quantifier != null && '*+?{'.includes(quantifier)) {
        if (node.kind === 'unknown' && ['^', '$'].includes(this.source[this.index - 1]!)) {
          throw new Error('Quantified anchors are unsupported.');
        }
        this.index++;
        let min = quantifier === '+' ? 1 : 0;
        if (quantifier === '{') {
          const bounds = /^(\d+)(?:,(\d*))?\}/.exec(this.source.slice(this.index));
          if (bounds == null) {
            throw new Error('Unsupported repetition bounds.');
          }
          min = Number(bounds[1]);
          const max = bounds[2] == null ? min : bounds[2] === '' ? 255 : Number(bounds[2]);
          if (min > max || max > 255) {
            throw new Error('Repetition bounds exceed PG limits.');
          }
          this.index += bounds[0].length;
        }
        node = { kind: 'repeat', child: node, min };
      }
      const previous = children.at(-1);
      if (node.kind === 'literal' && previous?.kind === 'literal') {
        previous.value += node.value;
      } else {
        children.push(node);
      }
    }
    return { kind: 'sequence', children };
  }

  /** Reads literals, groups, dot and anchors, rejecting extensions and ambiguous escapes. */
  private atom(): Node {
    const char = this.source[this.index++]!;
    if (char === '(') {
      if (this.source.slice(this.index, this.index + 2) === '?:') {
        this.index += 2;
      } else if (this.source[this.index] === '?') {
        throw new Error('Regex extensions require PostgreSQL.');
      }
      const child = this.choice();
      if (this.source[this.index++] !== ')') {
        throw new Error('Unclosed group.');
      }
      return child;
    }
    if (char === '\\') {
      const escaped = this.source[this.index++];
      if (escaped == null || !'^$.*+?()[]{}|/\\'.includes(escaped)) {
        throw new Error('Unknown regex escape requires PostgreSQL.');
      }
      return { kind: 'literal', value: escaped };
    }
    if ('.^$'.includes(char)) {
      return { kind: 'unknown' };
    }
    if ('[]{}*+?'.includes(char)) {
      throw new Error('Unknown regex construct requires PostgreSQL.');
    }
    return { kind: 'literal', value: char };
  }
}

/** Combines necessary facts, dropping unconstrained AND members but never OR members. */
function condition(kind: 'and' | 'or', values: Array<TextCondition | null>): TextCondition | null {
  if (kind === 'or' && values.some(value => value == null)) {
    return null;
  }
  const exprs = values.filter((value): value is TextCondition => value != null);
  return exprs.length === 0 ? null : exprs.length === 1 ? exprs[0]! : { kind, exprs };
}

/** Finds facts required by every match without expanding repetitions or ignoring branches. */
function necessary(node: Node): TextCondition | null {
  switch (node.kind) {
  case 'literal':
    return node.value === '' ? null : { kind: 'contains', value: node.value };
  case 'unknown':
    return null;
  case 'repeat':
    return node.min === 0 ? null : necessary(node.child);
  case 'sequence':
  case 'choice':
    return condition(node.kind === 'sequence' ? 'and' : 'or', node.children.map(necessary));
  }
}

/** Enumerates only pure literal languages, bounded to prevent Cartesian explosion. */
function literals(node: Node): string[] | null {
  if (node.kind === 'literal') {
    return [node.value];
  }
  if (node.kind !== 'sequence' && node.kind !== 'choice') {
    return null;
  }
  let result = node.kind === 'sequence' ? [''] : [];
  for (const child of node.children) {
    const values = literals(child);
    if (values == null) {
      return null;
    }
    if (node.kind === 'sequence') {
      if (result.length * values.length > 128) {
        return null;
      }
      result = result.flatMap(prefix => values.map(value => prefix + value));
    } else {
      result.push(...values);
      if (result.length > 128) {
        return null;
      }
    }
  }
  return result;
}

/** Analyzes effective PG syntax; caller flags stay ignored exactly as in the legacy PG handler. */
export function analyzeRegex(source: string): RegexAnalysis {
  if (source.length > 4096 || /[^\x20-\x7e]/.test(source)) {
    return { type: 'original', reason: 'Pattern exceeds the ASCII analysis subset or budget.' };
  }
  try {
    const tree = new RegexParser(pgRegexSource(source)).parse();
    const words = literals(tree);
    if (words != null && words.length > 0 && words.every(word => word.length > 0)) {
      return {
        type:      'exact',
        condition: condition('or', [...new Set(words)].map(value => ({ kind: 'contains', value })))!,
      };
    }
    const candidate = necessary(tree);
    return candidate == null
      ? { type: 'original', reason: 'No proven necessary substring.' }
      : { type: 'candidate', condition: candidate };
  } catch (error) {
    return { type: 'original', reason: (error as Error).message };
  }
}
