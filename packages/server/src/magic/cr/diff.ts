import CR from '@/magic/db/cr';
import { Content, Glossary } from '@interface/magic/cr';

import { diffArrays, diffWordsWithSpace } from 'diff';
import { last, zip } from 'lodash';

type TextChange = string | [string, string];

interface ContentChange {
    id: string;
    type?: 'add' | 'move' | 'remove';
    index: [string | undefined, string | undefined];
    depth: [number | undefined, number | undefined];
    text: TextChange[];
    examples: TextChange[][];
}

interface GlossaryChange {
    ids: string[];
    words: string[];
    type?: 'add' | 'move' | 'remove';
    text?: TextChange[];
}

interface Change {
    intro: TextChange[];
    contents: ContentChange[];
    glossary: GlossaryChange[];
    credits: TextChange[];
    csi: TextChange[];
}

function diffString(lhs: string, rhs: string): TextChange[] {
    const diffs: TextChange[] = [];

    for (const d of diffWordsWithSpace(lhs, rhs)) {
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
                diffs[diffs.length - 1] += d.value;
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

            if (i !== 0 && i !== diffs.length - 1) {
                const prev = diffs[i - 1]; const
                    next = diffs[i + 1];

                if (typeof prev === 'string' && typeof next === 'string') {
                    if (prev.endsWith('{') && next.startsWith('}')) {
                        d[0] = `{${d[0]}}`;
                        d[1] = `{${d[1]}}`;

                        diffs[i - 1] = prev.slice(0, -1);
                        diffs[i + 1] = next.slice(1);
                    } else if (prev.endsWith('{') && d[0].endsWith('{') && d[1] === '') {
                        d[0] = `{${d[0].slice(0, -1)}`;

                        diffs[i - 1] = prev.slice(0, -1);
                        diffs[i + 1] = `{${next}`;
                    }
                }
            }
        }
    }

    return diffs;
}

type ThreeChange = {
    type: 'add' | 'common' | 'dual' | 'remove';
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

        // eslint-disable-next-line @typescript-eslint/prefer-string-starts-ends-with
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

function isChanged(change: TextChange[]) {
    if (change.length === 0) {
        return false;
    } else if (change.length === 1) {
        return typeof change[0] !== 'string';
    } else {
        return true;
    }
}

export async function diff(fromDate: string, toDate: string): Promise<Change | undefined> {
    if (fromDate === toDate) {
        return {
            intro:    [],
            contents: [],
            glossary: [],
            credits:  [],
            csi:      [],
        };
    }

    const from = await CR.findOne({ date: fromDate });
    const to = await CR.findOne({ date: toDate });

    if (from == null || to == null) {
        return undefined;
    }

    const intro = diffString(from.intro, to.intro);
    const credits = diffString(from.credits, to.credits);
    const csi = diffString(from.csi ?? '', to.csi ?? '');

    let contents: Partial<ContentChange>[] = [];

    for (const d of diffArrays(from.contents.map(c => c.id), to.contents.map(c => c.id))) {
        if (d.added) {
            for (const v of d.value) { contents.push({ id: v, type: 'add' }); }
        } else if (d.removed) {
            for (const v of d.value) { contents.push({ id: v, type: 'remove' }); }
        } else {
            for (const v of d.value) { contents.push({ id: v }); }
        }
    }

    const contentMoved = contents.filter(d => d.type === 'remove' && contents.some(e => e.id === d.id && e.type === 'add')).map(d => d.id!);

    for (const d of contents) {
        if (contentMoved.includes(d.id!) && d.type === 'add') {
            d.type = 'move';
        }
    }

    contents = contents.filter(d => !contentMoved.includes(d.id!) || d.type !== 'remove');

    const oldContentMap: Record<string, Content> = {};
    const newContentMap: Record<string, Content> = {};

    for (const c of from.contents) { oldContentMap[c.id] = c; }
    for (const c of to.contents) { newContentMap[c.id] = c; }

    for (const d of contents) {
        const oldItem = oldContentMap[d.id!];
        const newItem = newContentMap[d.id!];

        d.index = [oldItem?.index, newItem?.index];
        d.depth = [oldItem?.depth, newItem?.depth];

        if (d.type == null && d.depth[0] !== d.depth[1]) {
            d.type = 'move';
        }

        d.text = diffString(oldItem?.text ?? '', newItem?.text ?? '');
        d.examples = zip(oldItem?.examples ?? [], newItem?.examples ?? [])
            .map(([l, r]) => diffString(l ?? '', r ?? ''));
    }

    contents = contents.filter(d => d.type != null
        || (d.text && isChanged(d.text))
        || (d?.examples?.some(isChanged)));

    for (const d of contents) {
        if (
            !isChanged(d.text!)
            && d.type == null
            && (d.examples == null || d.examples.every(d => !isChanged(d)))
        ) { delete d.text; }
        if (d?.examples?.every(d => !isChanged(d))) { delete d.examples; }
    }

    let glossary: Partial<GlossaryChange>[] = [];

    for (const d of diffArrays(from.glossary.map(c => c.ids.join(' ')), to.glossary.map(c => c.ids.join(' ')))) {
        if (d.added) {
            for (const v of d.value) { glossary.push({ ids: v.split(' '), type: 'add' }); }
        } else if (d.removed) {
            for (const v of d.value) { glossary.push({ ids: v.split(' '), type: 'remove' }); }
        } else {
            for (const v of d.value) { glossary.push({ ids: v.split(' ') }); }
        }
    }

    const glossaryMoved = glossary.filter(d => d.type === 'remove' && glossary.some(e => e.ids?.join(' ') === d.ids?.join(' ') && e.type === 'add')).map(d => d.ids!.join(' '));

    for (const d of glossary) {
        if (glossaryMoved.includes(d.ids!.join(' ')) && d.type === 'add') {
            d.type = 'move';
        }
    }

    glossary = glossary.filter(d => !glossaryMoved.includes(d.ids!.join(' ')) || d.type !== 'remove');

    const oldGlossaryMap: Record<string, Glossary> = {}; const
        newGlossaryMap: Record<string, Glossary> = {};

    for (const g of from.glossary) { oldGlossaryMap[g.ids.join(' ')] = g; }
    for (const g of to.glossary) { newGlossaryMap[g.ids.join(' ')] = g; }

    for (const g of glossary) {
        const oldItem = oldGlossaryMap[g.ids!.join(' ')];
        const newItem = newGlossaryMap[g.ids!.join(' ')];

        g.words = newItem?.words ?? oldItem?.words;
        g.text = diffString(oldItem?.text ?? '', newItem?.text ?? '');
    }

    glossary = glossary.filter(d => d.type != null || (d.text && isChanged(d.text)));

    for (const d of glossary) {
        if (!isChanged(d.text!)) { delete d.text; }
    }

    return {
        intro:    isChanged(intro) ? intro : [],
        contents: contents as ContentChange[],
        glossary: glossary as GlossaryChange[],
        credits:  isChanged(credits) ? credits : [],
        csi:      isChanged(csi) ? csi : [],
    };
}
