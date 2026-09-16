/** One written span of collector numbers, e.g. `001-019`. */
const rangePattern = /^(?<from>\d+)\s*-\s*(?<to>\d+)$/;

/**
 * One item of the field: a span written with spaces around its hyphen, or a run
 * of characters between separators. Spans are matched first so that `1 - 19` is
 * one item rather than the three a whitespace split would produce, while the
 * trailing check keeps `1-100a` one item instead of a range plus a stray `a`.
 */
const itemPattern = /\d+\s*-\s*\d+(?=[,，\s]|$)|[^,，\s]+/g;

/** Splits a number field value into its items, accepting both comma forms and whitespace. */
function splitItems(text: string): string[] {
  return text.match(itemPattern) ?? [];
}

/**
 * Width the numbers of one range are written at: an endpoint written with a
 * leading zero sets the width, and a range written without padding keeps none —
 * `9-10` stays `9`/`10` while `001-019` stays padded.
 */
function rangeWidth(from: string, to: string): number {
  const padded = [from, to].filter(end => end.length > 1 && end.startsWith('0'));
  return padded.length === 0 ? 1 : Math.max(...padded.map(end => end.length));
}

/** Expands `from-to` inclusive at the range's written width. */
function expandRange(from: string, to: string): string[] {
  const width = rangeWidth(from, to);
  const start = Number(from);
  const end = Number(to);
  const step = start <= end ? 1 : -1;
  const numbers: string[] = [];
  for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
    numbers.push(String(value).padStart(width, '0'));
  }
  return numbers;
}

/**
 * Collector numbers one 编号 field value stands for: items separated by commas or
 * whitespace, where an item written as `a-b` is a span. A span is only read as a
 * range when both ends are pure digits, so numbers that merely contain a hyphen
 * (`A-1`) or carry a letter (`100a-102a`, `1-100a`) stay literal.
 */
export function parseNumberInput(text: string): string[] {
  const numbers: string[] = [];
  const seen = new Set<string>();
  for (const item of splitItems(text)) {
    const range = rangePattern.exec(item);
    const expanded = range?.groups ? expandRange(range.groups.from!, range.groups.to!) : [item];
    for (const number of expanded) {
      if (seen.has(number)) continue;
      seen.add(number);
      numbers.push(number);
    }
  }
  return numbers;
}

/** Whether one collector number is written as pure digits, the only form a range span accepts. */
function pureNumber(number: string): number | null {
  return /^\d+$/.test(number) ? Number(number) : null;
}

/**
 * 编号 field text one number list stands for — the inverse of parseNumberInput.
 * Numbers sort by leading value, and runs of consecutive pure-digit numbers
 * collapse into `a-b` spans; everything else stays literal, joined by commas.
 */
export function formatNumberInput(numbers: string[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => {
    const na = pureNumber(a);
    const nb = pureNumber(b);
    if (na != null && nb != null) return na - nb || a.localeCompare(b);
    if (na != null) return -1;
    if (nb != null) return 1;
    return a.localeCompare(b);
  });

  const items: string[] = [];
  let run: { from: string, to: string, value: number } | null = null;
  const flushRun = () => {
    if (!run) return;
    items.push(run.from === run.to ? run.from : `${run.from}-${run.to}`);
    run = null;
  };
  for (const number of sorted) {
    const value = pureNumber(number);
    if (value != null && run && value === run.value + 1) {
      run = { from: run.from, to: number, value };
      continue;
    }
    flushRun();
    if (value != null) run = { from: number, to: number, value };
    else items.push(number);
  }
  flushRun();
  return items.join(',');
}
