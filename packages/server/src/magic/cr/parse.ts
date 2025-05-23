import CR from '@/magic/db/cr';
import { CR as ICR, Content, Glossary } from '@interface/magic/cr';

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { last, zip } from 'lodash';

import { diffString } from '@common/util/diff';
import { toIdentifier } from '@common/util/id';

import { dataPath } from '@/config';

function parseContentLine(text: string) {
    let m: RegExpExecArray | null;

    if ((m = /^(\d\.) /.exec(text)) != null) {
        // 1. Concepts
        return {
            text:  text.slice(m[0].length),
            id:    `~${m[1]}`,
            depth: 0,
            index: m[1],
        };
    } else if ((m = /^(\d{3}\.) /.exec(text)) != null) {
        // 101. The Magic Golden Rules
        return {
            text:  text.slice(m[0].length),
            id:    `~${m[1]}`,
            depth: 1,
            index: m[1],
        };
    } else if ((m = /^(\d{3}\.\d+\.) /.exec(text)) != null) {
        // 101.1. xxxxx
        return {
            text:  text.slice(m[0].length),
            id:    `~${m[1]}`,
            depth: 2,
            index: m[1],
        };
    } else if ((m = /^(\d{3}\.\d+[a-z]\.?) /.exec(text)) != null) {
        // 101.1a xxxxxx
        return {
            text:  text.slice(m[0].length),
            id:    `~${m[1]}`,
            depth: 3,
            index: m[1],
        };
    } else if ((m = /^( {5})/.exec(text)) != null) {
        return {
            text:  text.slice(m[0].length),
            depth: 'append',
        };
    } else if ((m = /^(Example: )/.exec(text)) != null) {
        return {
            text:  text.slice(m[0].length),
            depth: 'example',
        };
    } else {
        throw new Error(`Unknown text "${text}`);
    }
}

function parseGlossary(texts: string[]) {
    const m = /(\(Obsolete\))$/.exec(texts[0]);

    const [first, obsolete] = m == null ? [texts[0], false] : [texts[0].slice(0, -m[0].length), true];

    const words = first === 'Active Player, Nonactive Player Order' ? [first] : first.split(',').map(s => s.trim());

    return {
        words,
        ids: words.map(v => toIdentifier(
            v
                .replace(/^“|”$/g, '')
                .replace(/\[.+\]$/g, '')
                .trim(),
        )),
        text: (obsolete ? '(Obsolete) ' : '') + texts.slice(1).join('\n'),
    };
}

export async function parse(date: string): Promise<ICR> {
    const path = join(dataPath, 'magic', 'rule', `${date}.txt`);

    if (!existsSync(path)) {
        throw new Error(`cr ${date} doesn't exist`);
    }

    const text = readFileSync(path).toString();

    let intro = '';
    const contents: Content[] = [];
    const glossary: Glossary[] = [];
    let credits = '';
    let csi = '';

    let glossrayLines = [];

    let mode = 'title';

    for (const l of text.split('\n')) {
        switch (mode) {
        case 'title':
            if (l === 'Introduction') {
                mode = 'intro';
            }
            break;
        case 'intro':
            if (l === 'Contents') {
                mode = 'menu';
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
            } else if (l !== '') {
                const content = parseContentLine(l);

                if (content.depth === 'append') {
                    last(contents)!.text += `\n${content.text}`;
                } else if (content.depth === 'example') {
                    last(contents)!.examples = [...last(contents)!.examples ?? [], content.text];
                } else {
                    contents.push(content as Content);
                }
            }
            break;
        case 'glossary':
            if (l === 'Credits') {
                mode = 'credits';
            } else if (l === '') {
                if (glossrayLines.length > 0) {
                    glossary.push(parseGlossary(glossrayLines));

                    glossrayLines = [];
                }
            } else {
                glossrayLines.push(l);
            }
            break;
        case 'credits':
            if (l === 'Customer Service Information' || l === 'Questions?') {
                mode = 'csi';
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

    intro = intro.trim();
    credits = credits.trim();
    csi = csi.trim();

    const crDates: string[] = await CR.find({ date: { $ne: date } }).sort({ date: 1 }).distinct('date');
    const nearestDate = crDates.find(d => d > date) ?? last(crDates);
    const crDoc = await CR.findOne({ date: nearestDate });

    if (crDoc != null) {
        for (const c of contents) {
            if (!c.id.startsWith('~')) {
                continue;
            }

            // exact text
            const same = [...contents.entries()].filter(eo => eo[1].text === c.text);
            const sameInDoc = [...crDoc.contents.entries()].filter(eo => eo[1].text === c.text);

            if (sameInDoc.length === same.length) {
                for (const [e, ed] of zip(same, sameInDoc)) {
                    contents[e![0]].id = crDoc.contents[ed![0]].id;
                }

                continue;
            } else if (sameInDoc.length > 0) {
                for (const e of same) {
                    contents[e[0]].id = sameInDoc[0][1].id;
                }

                continue;
            }

            // rough text
            const sameId = crDoc.contents.find(co => co.index === c.index);

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
                    c.id = sameId.id;
                }
            }
        }
    }

    return {
        date,
        intro,
        contents,
        glossary,
        credits,
        csi: csi !== '' ? csi : undefined,
    };
}

export async function reparse(date: string): Promise<ICR> {
    const parseResult = await parse(date);

    const data = await CR.findOne({ date });

    if (data == null) {
        throw new Error(`cr ${date} doesn't exist`);
    }

    data.intro = parseResult.intro;

    for (const [co, cn] of zip(data.contents, parseResult.contents)) {
        if (co == null || cn == null) {
            throw new Error(`cr ${date} contents mismatch`);
        }

        if (co.id.startsWith('~') && !cn.id.startsWith('~')) {
            co.id = cn.id;
        }

        co.index = cn.index;
        co.text = cn.text;
        co.examples = cn.examples;
    }

    for (const [go, gn] of zip(data.glossary, parseResult.glossary)) {
        if (go == null || gn == null) {
            throw new Error(`cr ${date} glossary mismatch`);
        }

        go.words = gn.words;
        go.text = gn.text;
    }

    data.credits = parseResult.credits;
    data.csi = parseResult.csi;

    await data.save();

    return {
        date:     data.date,
        intro:    data.intro,
        contents: data.contents,
        glossary: data.glossary,
        credits:  data.credits,
        csi:      data.csi,
    };
}
