
import CR, { ICR, ICRContent, ICRGlossary } from '@/magic/db/cr';

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { last } from 'lodash';
import { toIdentifier } from '../util';

import { data } from '@config';

function parseContentLine(text: string) {
    let m: RegExpExecArray | null;

    if ((m = /^(\d\.) /.exec(text)) != null) {
        return {
            text:  text.slice(m[0].length),
            id:    '~' + m[1],
            depth: 0,
            index: m[1],
        };
    } else if ((m = /^(\d{3}\.) /.exec(text)) != null) {
        return {
            text:  text.slice(m[0].length),
            id:    '~' + m[1],
            depth: 1,
            index: m[1],
        };
    } else if ((m = /^(\d{3}\.\d+\.) /.exec(text)) != null) {
        return {
            text:  text.slice(m[0].length),
            id:    '~' + m[1],
            depth: 2,
            index: m[1],
        };
    } else if ((m = /^(\d{3}\.\d+[a-z])\.? /.exec(text)) != null) {
        return {
            text:  text.slice(m[0].length),
            id:    '~' + m[1],
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
        return {
            text,
            depth: null,
        };
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

export async function parse(date: string): Promise<ICR> /* : { menu: CRMenu, items: CRItem[] } */ {
    const path = join(data, 'magic', 'cr', 'txt', date + '.txt');
    if (!existsSync(path)) {
        throw new Error(`cr ${date} doesn't exist`);
    }

    const text = readFileSync(path).toString();

    let intro = '';
    const contents: ICRContent[] = [];
    const glossary: ICRGlossary[] = [];
    let credits = '';

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
                intro += '\n' + l;
            }
            break;
        case 'menu':
            if (l === 'Credits') {
                mode = 'content';
            }
            break;
        case 'content':
            if (l === 'Glossary') {
                mode = 'glossary';
            } else if (l !== '') {
                const content = parseContentLine(l);

                if (content.depth === 'append') {
                    last(contents)!.text += '\n' + content.text;
                } else if (content.depth === 'example') {
                    last(contents)!.examples = [...last(contents)!.examples || [], content.text];
                } else {
                    contents.push(content as ICRContent);
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
            credits += '\n' + l;
        }
    }

    intro = intro.trim();

    const crs = [];

    for (const [i, c] of contents.entries()) {
        for (const cr of crs) {
            let idxDistance = contents.length;

            for (const [cri, crc] of cr.contents.entries()) {
                if (crc.text === c.text) {
                    if (Math.abs(cri - i) < idxDistance) {
                        c.id = crc.id;
                        idxDistance = Math.abs(cri - i);
                    }
                }
            }
        }

        if (c.id.startsWith('~')) {
            const cr = await CR.findOne({ 'contents.text': c.text }).sort({ date: 1 });

            if (cr != null) {
                crs.push(cr);

                let idxDistance = contents.length;

                for (const [cri, crc] of cr.contents.entries()) {
                    if (crc.text === c.text) {
                        if (Math.abs(cri - i) < idxDistance) {
                            c.id = crc.id;
                            idxDistance = Math.abs(cri - i);
                        }
                    }
                }
            }
        }
    }

    credits = credits.trim();

    return {
        date,
        intro,
        contents,
        glossary,
        credits,
    };
}
