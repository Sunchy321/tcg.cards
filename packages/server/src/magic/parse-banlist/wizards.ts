import * as cheerio from 'cheerio';
import * as request from 'request-promise-native';

import { escapeRegExp } from 'lodash';

import { IBanlistChange, parseDate, getLines } from './index';
import { toIdentifier } from '../util';

const formatMap: { [k: string]: string } = {
    'Standard': 'standard',
    'Historic': 'historic',
    'Pioneer': 'pioneer',
    'Modern': 'modern',
    'Extended': 'extended',
    'Legacy': 'legacy',
    'Type 1.5': 'legacy',
    'Vintage': 'vintage',
    'Vintage (formerly known as Type 1)': 'vintage',
    'Type 1': 'vintage',
    'Magic Online Pauper': 'pauper',
    'Brawl': 'brawl',

    'Innistrad Block Constructed': 'block/innistrad',
    'Mirrodin Block Constructed': 'block/mirrodin',

    'Two-Headed Giant Constructed': 'two_head_giant',

    'Classic': 'online_classic',
    'Online Classic': 'online_classic',
    'Kaleidoscope**': 'kaleidoscope',
    'Prismatic': 'prismatic',
    'Singleton': 'singleton',
    '100 Card Singleton': '100_card_singleton',
    'Tribal': 'tribal',

    // Sentences
    'The banned list for Pauper is as follows': 'pauper',
    'The new banned list for 100 Card Singleton is as follows': '100_card_singleton',
    'The new banned list for Commander is as follows': 'online_commander',
    'Format: 100 Card Singleton': '100_card_singleton',
};

function isStrong(e: CheerioElement): boolean {
    return e.tagName === 'strong' || e.tagName === 'b';
}

function isCardLink(e: CheerioElement, $: CheerioSelector): boolean {
    return e.tagName === 'a' && ($(e).hasClass('autocard-link') || $(e).hasClass('nodec'));
}

function parseDateText(sText: string, rest: string, result: IBanlistChange ): string | null | undefined {
    const sTextDeburr = sText.replace(/\xA0/g, ' ');

    switch (sTextDeburr) {
        case 'Announcement Date':
            result.date = parseDate(rest);
            return;
        case 'Effective Date':
        case 'Tabletop Effective Date':
            result.effectiveDate!.tabletop = parseDate(rest);
            return;
        case 'Magic Online Effective Date':
        case 'Magic OnlineEffective Date':
            result.effectiveDate!.online = parseDate(rest);
            return;
        case 'MTG Arena Effective Date':
            result.effectiveDate!.arena = parseDate(rest);
            return;
        case 'Next B&R Announcement':
        case 'Next Pioneer B&R Announcement':
        case 'Next Pioneer Banned Announcement':
            result.nextDate = parseDate(rest);
            return null;
        default:
            // Formats
            if (rest === '') {
                return formatMap[sText] || null;
            }
        }
}

const statusMap: { [k: string]: string } = {
    '': 'banned',
    'banned': 'banned',
    'is banned': 'banned',
    'are banned': 'banned',
    'is suspended': 'suspended',
    'is restricted': 'restricted',
    'is unbanned': 'legal',
    'is unrestricted': 'legal',
    'is no longer banned': 'legal',
    'is no longer restricted': 'legal',
    'are unbanned': 'legal',
};

function parseStatus(text: string): string {
    const trimmed = text.trim().toLowerCase().replace(/(\.|\*+)$/, '');

    return statusMap[trimmed] || `<${trimmed}>`;
}

function parseLine(elems: CheerioElement[], currFormat: string, $: CheerioSelector): Array<{
    card: string,
    format: string
    status: string,
}> {
    const pairs: Array<{
        card: string,
        status: string,
    }> = [];

    const cards: string[] = [];

    for (const e of elems) {
        if (e.tagName === 'a') {
            cards.push(toIdentifier($(e).text()));
        } else {
            const text = $(e).text();

            if ([',', 'and', ', and'].includes(text.trim())) {
                continue;
            }

            pairs.push(...cards.map(c => ({
                card: c,
                status: parseStatus(text),
            })));

            cards.splice(0, cards.length);
        }
    }

    return pairs.map(p => ({
        card: p.card,
        format: currFormat,
        status: p.status,
    }));
}

export async function parseWizardsBanlist(url: string): Promise<IBanlistChange> {
    const html = await request(url) as string;
    const $ = cheerio.load(html);

    const content = (() => {
        const c = $('#content-detail-page-of-an-article');

        if (c.children().length === 1) {
            return $(c.children().get(0));
        } else {
            return c;
        }
    })();

    const result: IBanlistChange = {
        type: 'banlist-change',
        source: 'wotc',
        date: undefined,
        nextDate: undefined,
        effectiveDate: { },
        link: [url],
        changes: [],
        __debug: [],
    };

    if (url.includes('pioneer')) {
        result.category = 'pioneer';
    }

    let currFormat: string | null = null;

    for (const e of getLines(content, $)) {
        const text = e.map(v => $(v).text()).join('');

        result.__debug!.push({
            type: 'line',
            tag: e.map(v => v.tagName),
            format: currFormat,
            text,
        });

        if (isStrong(e[0])) {
            const sText = (t => t.endsWith(':') ? t.slice(0, -1) : t)(
                e.filter(isStrong).map(v => $(v).text()).join(''),
            );

            const rest = text.replace(new RegExp(escapeRegExp(sText) + ':?'), '').trim();

            result.__debug!.push({
                type: 'strong',
                sText, rest,
            });

            const newFormat = parseDateText(sText, rest, result);

            if (newFormat !== undefined) {
                currFormat = newFormat;
            }
        } else if (currFormat != null) {
            if (isCardLink(e[0], $)) {
                result.changes.push(...parseLine(e, currFormat, $));
            } else {
                for (const s of Object.keys(statusMap)) {
                    if (s !== '' && s !== 'banned' && text.endsWith(s)) {
                        result.changes.push({
                            card: toIdentifier(text.slice(0, -s.length)),
                            format: currFormat,
                            status: statusMap[s],
                        });
                        break;
                    }
                }
            }
        }
    }

    if (
        result.effectiveDate!.tabletop == null &&
        result.effectiveDate!.online == null &&
        result.effectiveDate!.arena == null
    ) {
        result.effectiveDate = undefined;
    }

    return result;
}

export async function parseWizardsOldBanlist(url: string): Promise<IBanlistChange> {
    const html = await request(url) as string;
    const $ = cheerio.load(html);

    const content = $('#bodycontent');

    const result: IBanlistChange = {
        type: 'banlist-change',
        source: 'wotc',
        date: undefined,
        nextDate: undefined,
        effectiveDate: { },
        link: [url],
        changes: [],
        __debug: [],
    };

    let currFormat: string | null = null;

    for (const e of getLines(content, $)) {
        const text = e.map(v => $(v).text()).join('').trim();

        result.__debug!.push({
            type: 'line',
            tag: e.map(v => v.tagName),
            format: currFormat,
            text,
        });

        if (isStrong(e[0])) {
            const sText = (t => t.endsWith(':') ? t.slice(0, -1) : t)(
                e.filter(isStrong).map(v => $(v).text().trim()).join(''),
            );

            const rest = text.replace(new RegExp(escapeRegExp(sText) + ':?'), '').trim();

            result.__debug!.push({
                type: 'strong',
                sText, rest,
            });

            const newFormat = parseDateText(sText, rest, result);

            if (newFormat !== undefined) {
                currFormat = newFormat;
            }
        } else if (e[0].tagName === 'h3') {
            currFormat = formatMap[$(e[0]).text()];
        } else if (currFormat != null) {
            for (const s of Object.keys(statusMap)) {
                if (s !== '' && s !== 'banned') {
                    if (text.endsWith(s)) {
                        result.changes.push({
                            card: toIdentifier(text.slice(0, -s.length)),
                            format: currFormat,
                            status: statusMap[s],
                        });
                        break;
                    } else if (text.endsWith(s + '.')) {
                        result.changes.push({
                            card: toIdentifier(text.slice(0, -s.length - 1)),
                            format: currFormat,
                            status: statusMap[s],
                        });
                        break;
                    }
                }
            }
        }
    }

    return result;
}
