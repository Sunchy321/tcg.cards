import { Rule as IRule, RuleItem as IRuleItem } from '@model/magic/schema/rule';

import { and, eq, ne } from 'drizzle-orm';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { last, zip } from 'lodash';

import { diffString } from '@common/util/diff';
import { toIdentifier } from '@common/util/id';

import { db } from '@/drizzle';
import { Rule, RuleItem } from '@/magic/schema/rule';

import { dataPath } from '@/config';

function parseContentLine(text: string): Omit<IRuleItem, 'index' | 'richText' | 'depth'> & { depth: number | 'append' | 'example' } {
    let m: RegExpExecArray | null;

    if ((m = /^(\d\.) /.exec(text)) != null) {
        // 1. Concepts
        return {
            itemId: `~${m[1]}`,
            depth:  0,
            serial: m[1],
            text:   text.slice(m[0].length),
        };
    } else if ((m = /^(\d{3}\.) /.exec(text)) != null) {
        // 101. The Magic Golden Rules
        return {
            itemId: `~${m[1]}`,
            depth:  1,
            serial: m[1],
            text:   text.slice(m[0].length),
        };
    } else if ((m = /^(\d{3}\.\d+\.) /.exec(text)) != null) {
        // 101.1. xxxxx
        return {
            itemId: `~${m[1]}`,
            depth:  2,
            serial: m[1],
            text:   text.slice(m[0].length),
        };
    } else if ((m = /^(\d{3}\.\d+[a-z]\.?) /.exec(text)) != null) {
        // 101.1a xxxxxx
        return {
            itemId: `~${m[1]}`,
            depth:  3,
            serial: m[1],
            text:   text.slice(m[0].length),
        };
    } else if ((m = /^( {5})/.exec(text)) != null) {
        return {
            itemId: '~append',
            depth:  'append',
            serial: null,
            text:   text.slice(m[0].length),
        };
    } else if ((m = /^(Example: )/.exec(text)) != null) {
        return {
            itemId: '~example',
            depth:  'example',
            serial: null,
            text:   text.slice(m[0].length),
        };
    } else {
        throw new Error(`Unknown text "${text}`);
    }
}

function parseGlossary(texts: string[]): Omit<IRuleItem, 'index' | 'richText'>[] {
    const m = /(\(Obsolete\))$/.exec(texts[0]);

    const [first, obsolete] = m == null ? [texts[0], false] : [texts[0].slice(0, -m[0].length), true];

    const words = first === 'Active Player, Nonactive Player Order' ? [first] : first.split(',').map(s => s.trim());

    const itemId = 'glossary.' + toIdentifier(words[0]).replace(/_+/g, '-').replace(/-$/, '');

    return [
        {
            itemId: itemId + '.words',
            depth:  1,
            serial: null,
            text:   words.join(', '),
        },
        {
            itemId,
            depth:  2,
            serial: null,
            text:   (obsolete ? '(Obsolete) ' : '') + texts.slice(1).join('\n'),
        },
    ];
}

export async function parse(date: string): Promise<IRule> {
    const path = join(dataPath, 'magic', 'rule', `${date}.txt`);

    if (!existsSync(path)) {
        throw new Error(`cr ${date} doesn't exist`);
    }

    const text = readFileSync(path).toString();

    let intro = '';
    const contents: Omit<IRuleItem, 'index' | 'richText'>[] = [];
    let credits = '';
    let csi = '';

    let glossrayLines = [];

    let mode = 'title';

    for (const l of text.split('\n')) {
        switch (mode) {
        case 'title':
            if (l === 'Introduction') {
                mode = 'intro';
                contents.push({ itemId: 'intro', depth: 0, serial: null, text: l });
            }
            break;
        case 'intro':
            if (l === 'Contents') {
                mode = 'menu';
                contents.push({ itemId: 'intro.text', depth: 1, serial: null, text: intro.trim() });
            } else {
                intro += `\n${l}`;
            }
            break;
        case 'menu':
            if (l === 'Credits') {
                mode = 'content';
            }
            break;
        case 'content':
            if (l === 'Customer Service Information' || l === 'Questions?') {
                // no-op
            } else if (l === 'Glossary') {
                mode = 'glossary';
                contents.push({ itemId: 'glossary', depth: 0, serial: null, text: l });
            } else if (l !== '') {
                const content = parseContentLine(l);

                if (content.depth === 'append') {
                    last(contents)!.text += `\n${content.text}`;
                } else if (content.depth === 'example') {
                    const lastItem = last(contents)!;

                    let m;

                    const newContent = (() => {
                        if ((m = /:e(\d+)$/.exec(lastItem.itemId)) != null) {
                            return {
                                itemId: `${lastItem.itemId.slice(0, -m[0].length)}:e${Number(m[1]) + 1}`,
                                depth:  lastItem.depth,
                                serial: null,
                                text:   content.text,
                            };
                        } else {
                            return {
                                itemId: `${lastItem.itemId}:e0`,
                                depth:  lastItem.depth,
                                serial: null,
                                text:   content.text,
                            };
                        }
                    })();

                    contents.push(newContent);
                } else {
                    contents.push({ ...content, depth: content.depth as number });
                }
            }
            break;
        case 'glossary':
            if (l === 'Credits') {
                mode = 'credits';
                contents.push({ itemId: 'credits', depth: 0, serial: null, text: l });
            } else if (l === '') {
                if (glossrayLines.length > 0) {
                    contents.push(...parseGlossary(glossrayLines));

                    glossrayLines = [];
                }
            } else {
                glossrayLines.push(l);
            }
            break;
        case 'credits':
            if (l === 'Customer Service Information' || l === 'Questions?') {
                mode = 'csi';
                contents.push({ itemId: 'credits.text', depth: 1, serial: null, text: credits.trim() });
                contents.push({ itemId: 'csi', depth: 0, serial: null, text: l });
            } else {
                credits += `\n${l}`;
            }
            break;
        case 'csi':
            csi += `\n${l}`;
            break;
        default:
        }
    }

    if (csi === '') {
        contents.push({ itemId: 'credits.text', depth: 1, serial: null, text: credits.trim() });
    } else {
        contents.push({ itemId: 'csi.text', depth: 1, serial: null, text: csi.trim() });
    }

    const crDates = await db.select({ date: Rule.date })
        .from(Rule)
        .where(ne(Rule.date, date))
        .orderBy(Rule.date)
        .then(rows => rows.map(r => r.date));

    const nearestDate = crDates.find(d => d > date) ?? last(crDates)!;

    const crDoc = await db.select()
        .from(Rule)
        .where(and(
            eq(Rule.date, nearestDate),
            eq(Rule.lang, 'en'),
        ))
        .then(rows => rows[0]);

    if (crDoc != null) {
        const items = await db.select()
            .from(RuleItem)
            .where(eq(RuleItem.date, crDoc.date))
            .then(rows => rows);

        for (const c of contents) {
            if (!c.itemId.startsWith('~')) {
                continue;
            }

            // exact text
            const same = [...contents.entries()].filter(eo => eo[1].text === c.text && !eo[1].itemId.startsWith('glossary.'));
            const sameInDoc = [...items.entries()].filter(eo => eo[1].text === c.text && !eo[1].itemId.startsWith('glossary.'));

            if (sameInDoc.length === same.length) {
                for (const [e, ed] of zip(same, sameInDoc)) {
                    contents[e![0]].itemId = items[ed![0]].itemId;
                }

                continue;
            } else if (sameInDoc.length > 0) {
                for (const e of same) {
                    contents[e[0]].itemId = sameInDoc[0][1].itemId;
                }

                continue;
            }

            // rough text
            if (c.serial != null) {
                const sameId = items.find(co => co.serial === c.serial);

                if (sameId != null) {
                    const diff = diffString(sameId.text, c.text);

                    let totalLength = 0;
                    let diffLength = 0;

                    for (const d of diff) {
                        if (typeof d === 'string') {
                            totalLength += d.length;
                        } else {
                            totalLength += d[1].length;
                            diffLength += d[1].length;
                        }
                    }

                    if (diffLength < 20 || diffLength / totalLength < 0.1) {
                        c.itemId = sameId.itemId;
                    }
                }
            }
        }
    }

    const fullContents = contents.map((c, i) => ({
        ...c,
        index:    i,
        richText: c.text,
    }));

    return {
        date,
        lang:     'en',
        contents: fullContents,
    };
}

export async function reparse(date: string): Promise<IRule> {
    const parseResult = await parse(date);

    const rule = await db.select()
        .from(Rule)
        .where(and(
            eq(Rule.date, date),
            eq(Rule.lang, 'en'),
        ))
        .then(rows => rows[0]);

    if (rule == null) {
        throw new Error(`cr ${date} doesn't exist`);
    }

    const contents = await db.select()
        .from(RuleItem)
        .where(and(
            eq(RuleItem.itemId, parseResult.contents[0].itemId),
            eq(RuleItem.lang, 'en'),
        ))
        .orderBy(RuleItem.date);

    for (const [co, cn] of zip(contents, parseResult.contents)) {
        if (co == null || cn == null) {
            throw new Error(`cr ${date} contents mismatch`);
        }

        if (co.itemId.startsWith('~') && !cn.itemId.startsWith('~')) {
            co.itemId = cn.itemId;
        }

        co.serial = cn.serial;
        co.text = cn.text;
        co.richText = cn.richText;
    }

    for (const co of contents) {
        await db.update(RuleItem)
            .set(co)
            .where(and(
                eq(RuleItem.date, co.date),
                eq(RuleItem.lang, 'en'),
                eq(RuleItem.itemId, co.itemId),
            ));
    }

    return {
        date: date,
        lang: 'en',
        contents,
    };
}
