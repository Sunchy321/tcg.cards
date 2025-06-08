import { diffChars as diffCharsImpl, diffWordsWithSpace } from 'diff';
import { last } from 'lodash';

type TextChange = string | [string, string];

export function diffChars(lhs: string, rhs: string): TextChange[] {
    const diffs: TextChange[] = [];

    for (const d of diffCharsImpl(lhs, rhs)) {
        if (d.added) {
            const lastDiff = last(diffs);

            if (lastDiff == null) {
                diffs.push(['', d.value]);
            } else if (typeof lastDiff === 'string') {
                diffs.push(['', d.value]);
            } else {
                lastDiff[1] += d.value;
            }
        } else if (d.removed) {
            const lastDiff = last(diffs);

            if (lastDiff == null) {
                diffs.push([d.value, '']);
            } else if (typeof lastDiff === 'string') {
                diffs.push([d.value, '']);
            } else {
                lastDiff[0] += d.value;
            }
        } else {
            const lastDiff = last(diffs);

            if (lastDiff == null) {
                diffs.push(d.value);
            } else if (typeof lastDiff === 'string') {
                diffs[diffs.length - 1] = (diffs[diffs.length - 1] as string) + d.value;
            } else if (d.value === ' ') {
                lastDiff[0] += d.value;
                lastDiff[1] += d.value;
            } else {
                diffs.push(d.value);
            }
        }
    }

    return diffs;
}

// map '{XXX}' into a single char with unicode private area
function encode(text: string, map: Record<string, string>): string {
    return text.split(/(\{[^}]+\})/).filter(v => v !== '').map(p => {
        if (p.startsWith('{') && p.endsWith('}')) {
            map[p] ??= String.fromCodePoint(Object.keys(map).length + 0xF0000);

            return map[p];
        }

        return p;
    }).join('');
}

function decode(text: string, map: Record<string, string>): string {
    return [...text].map(p => {
        if (p.codePointAt(0)! >= 0xF0000) {
            return Object.entries(map).find(([_, v]) => v === p)?.[0] ?? p;
        } else {
            return p;
        }
    }).join('');
}

export function diffString(lhs: string, rhs: string, encoder = encode): TextChange[] {
    const map: Record<string, string> = {};

    const diffs: TextChange[] = [];

    const lhsEncoded = encoder(lhs, map);
    const rhsEncoded = encoder(rhs, map);

    for (const d of diffWordsWithSpace(lhsEncoded, rhsEncoded)) {
        if (d.added) {
            const lastDiff = last(diffs);

            if (lastDiff == null) {
                diffs.push(['', d.value]);
            } else if (typeof lastDiff === 'string') {
                diffs.push(['', d.value]);
            } else {
                lastDiff[1] += d.value;
            }
        } else if (d.removed) {
            const lastDiff = last(diffs);

            if (lastDiff == null) {
                diffs.push([d.value, '']);
            } else if (typeof lastDiff === 'string') {
                diffs.push([d.value, '']);
            } else {
                lastDiff[0] += d.value;
            }
        } else {
            const lastDiff = last(diffs);

            if (lastDiff == null) {
                diffs.push(d.value);
            } else if (typeof lastDiff === 'string') {
                diffs[diffs.length - 1] = (diffs[diffs.length - 1] as string) + d.value;
            } else if (d.value === ' ') {
                lastDiff[0] += d.value;
                lastDiff[1] += d.value;
            } else {
                diffs.push(d.value);
            }
        }
    }

    for (const [i, d] of diffs.entries()) {
        if (typeof d !== 'string') {
            if (d[0].endsWith(' ') && d[1].endsWith(' ')) {
                d[0] = d[0].slice(0, -1);
                d[1] = d[1].slice(0, -1);

                if (i === diffs.length - 1) {
                    diffs.push(' ');
                } else if (typeof diffs[i + 1] === 'string') {
                    diffs[i + 1] = ` ${diffs[i + 1]}`;
                }
            }
        }
    }

    return diffs.map(v => {
        if (typeof v === 'string') {
            return decode(v, map);
        } else {
            return [decode(v[0], map), decode(v[1], map)] as const;
        }
    });
}

type ThreeChange = {
    type:  'add' | 'common' | 'dual' | 'remove';
    value: string;
};

export function diffThreeString(prev: string, curr: string, next: string): ThreeChange[] {
    const prevDiff = diffString(prev, curr);
    const nextDiff = diffString(curr, next);

    const diffs: ThreeChange[] = [];

    while (prevDiff.length > 0 && nextDiff.length > 0) {
        const lastPrev = prevDiff[0];
        const lastNext = nextDiff[0];

        if (lastPrev == null || lastNext == null) {
            throw new Error('diff mismatch');
        }

        const lastPrevText = typeof lastPrev === 'string' ? lastPrev : lastPrev[1];
        const lastNextText = typeof lastNext === 'string' ? lastNext : lastNext[0];

        const length = Math.min(lastPrevText.length, lastNextText.length);

        if (lastPrevText.slice(0, length) !== lastNextText.slice(0, length)) {
            throw new Error('diff mismatch');
        }

        const type = (() => {
            if (typeof lastPrev === 'string') {
                if (typeof lastNext === 'string') {
                    return 'common';
                } else {
                    return 'remove';
                }
            } else {
                if (typeof lastNext === 'string') {
                    return 'add';
                } else {
                    return 'dual';
                }
            }
        })();

        const value = lastPrevText.slice(0, length);

        if (length === lastPrevText.length) {
            prevDiff.shift();
        } else {
            if (typeof lastPrev === 'string') {
                prevDiff[0] = lastPrevText.slice(length);
            } else {
                prevDiff[0] = [lastPrev[0], lastPrevText.slice(length)];
            }
        }

        if (length === lastNextText.length) {
            nextDiff.shift();
        } else {
            if (typeof lastNext === 'string') {
                nextDiff[0] = lastNextText.slice(length);
            } else {
                nextDiff[0] = [lastNextText.slice(length), lastNext[1]];
            }
        }

        diffs.push({ type, value });
    }

    const mergedDiffs: ThreeChange[] = [];

    for (const d of diffs) {
        if (d.value === '') {
            continue;
        }

        const lastDiff = last(mergedDiffs);

        if (lastDiff == null) {
            mergedDiffs.push(d);
            continue;
        }

        if (lastDiff.type === d.type) {
            lastDiff.value += d.value;
        } else {
            mergedDiffs.push(d);
        }
    }

    return mergedDiffs;
}
