import cheerio from 'cheerio';
import request from 'request-promise-native';

import { FormatAnnouncement as IFormatAnnouncement, Legality } from '@interface/magic/format-change';

import { escapeRegExp } from 'lodash';

import { toIdentifier } from '@common/util/id';
import { parseDate, getLines } from './helper';

const formatMap: Record<string, string> = {
    'Standard':                           'standard',
    'Historic':                           'historic',
    'Pioneer':                            'pioneer',
    'Modern':                             'modern',
    'Extended':                           'extended',
    'Legacy':                             'legacy',
    'Type 1.5':                           'legacy',
    'Vintage':                            'vintage',
    'Vintage (formerly known as Type 1)': 'vintage',
    'Type 1':                             'vintage',
    'Magic Online Pauper':                'pauper',
    'Brawl':                              'brawl',

    'Innistrad Block Constructed': 'block/innistrad',
    'Mirrodin Block Constructed':  'block/mirrodin',

    'Two-Headed Giant Constructed': 'two_head_giant',

    'Classic':            'online_classic',
    'Online Classic':     'online_classic',
    'Kaleidoscope**':     'kaleidoscope',
    'Prismatic':          'prismatic',
    'Singleton':          'singleton',
    '100 Card Singleton': '100_card_singleton',
    'Tribal':             'tribal',

    // Sentences
    'The banned list for Pauper is as follows':                 'pauper',
    'The new banned list for 100 Card Singleton is as follows': '100_card_singleton',
    'The new banned list for Commander is as follows':          'online_commander',
    'Format: 100 Card Singleton':                               '100_card_singleton',
};

function isStrong(e: cheerio.TagElement): boolean {
    return e.tagName === 'strong' || e.tagName === 'b';
}

function isCardLink(e: cheerio.TagElement, $: cheerio.Root): boolean {
    return e.tagName === 'a' && ($(e).hasClass('autocard-link') || $(e).hasClass('nodec'));
}

function parseDateText(
    sText: string,
    rest: string,
    result: Partial<IFormatAnnouncement>,
): string | null | undefined {
    const sTextDeburr = sText.replace(/\xA0/g, ' ');

    switch (sTextDeburr) {
    case 'Announcement Date':
        result.date = parseDate(rest);
        return undefined;
    case 'Effective Date':
    case 'Tabletop Effective Date':
        result.effectiveDate!.tabletop = parseDate(rest);
        return undefined;
    case 'Magic Online Effective Date':
    case 'Magic OnlineEffective Date':
        result.effectiveDate!.online = parseDate(rest);
        return undefined;
    case 'MTG Arena Effective Date':
        result.effectiveDate!.arena = parseDate(rest);
        return undefined;
    case 'Next B&R Announcement':
    case 'Next Pioneer B&R Announcement':
    case 'Next Pioneer Banned Announcement':
        result.nextDate = parseDate(rest);
        return null;
    default:
        // Formats
        if (rest === '') {
            return formatMap[sText] || null;
        } else {
            return undefined;
        }
    }
}

const statusMap: Record<string, Legality> = {
    '':                        'banned',
    'banned':                  'banned',
    'is banned':               'banned',
    'are banned':              'banned',
    'is suspended':            'suspended',
    'is restricted':           'restricted',
    'is unbanned':             'legal',
    'is unrestricted':         'legal',
    'is unsuspended':          'legal',
    'is no longer banned':     'legal',
    'is no longer restricted': 'legal',
    'are unbanned':            'legal',
};

function parseStatus(text: string) {
    const trimmed = text.trim().toLowerCase().replace(/(\.|\*+)$/, '');

    return statusMap[trimmed] || `<${trimmed}>`;
}

function parseLine(elems: cheerio.TagElement[], currFormat: string, $: cheerio.Root) {
    const pairs = [];
    const cards = [];

    for (const e of elems) {
        if (e.tagName === 'a') {
            cards.push(toIdentifier($(e).text()));
        } else {
            const text = $(e).text();

            if ([',', 'and', ', and'].includes(text.trim())) {
                continue;
            }

            pairs.push(...cards.map(c => ({
                card:   c,
                status: parseStatus(text),
            })));

            cards.splice(0, cards.length);
        }
    }

    return pairs.map(p => ({
        card:   p.card,
        format: currFormat,
        status: p.status,
    }));
}

export async function parseWizardsBanlist(url: string): Promise<IFormatAnnouncement> {
    const html = await request(url);
    const $ = cheerio.load(html);

    const content = (() => {
        const c = $('#content-detail-page-of-an-article');

        if (c.children().length === 1) {
            return $(c.children().get(0));
        } else {
            return c;
        }
    })();

    const result: Partial<IFormatAnnouncement> = {
        source:        'wotc',
        date:          undefined,
        nextDate:      undefined,
        effectiveDate: { },
        link:          [url],
        changes:       [],
    };

    let currFormat: string | null = null;
    let currChange: IFormatAnnouncement['changes'][0] | undefined;

    for (const e of getLines(content, $)) {
        const text = e.map(v => $(v).text()).join('');

        if (text.startsWith('The list of all banned and restricted cards, by format, is here')) {
            currFormat = null;
        } else if (isStrong(e[0])) {
            const sText = (t => (t.endsWith(':') ? t.slice(0, -1) : t))(
                e.filter(isStrong).map(v => $(v).text()).join(''),
            );

            const rest = text.replace(new RegExp(`${escapeRegExp(sText)}:?`), '').trim();

            const newFormat = parseDateText(sText, rest, result);

            if (newFormat !== undefined) {
                currFormat = newFormat;

                if (!result.changes!.some(c => c.format === currFormat)) {
                    result.changes!.push({
                        format:  currFormat!,
                        banlist: [],
                    });
                }

                currChange = result.changes!.find(c => c.format === currFormat);
            }
        } else if (currFormat != null) {
            if (isCardLink(e[0], $)) {
                result.changes!.push(...parseLine(e, currFormat, $));
            } else {
                for (const s of Object.keys(statusMap)) {
                    if (s !== '' && s !== 'banned' && text.endsWith(s)) {
                        currChange!.banlist!.push({
                            id:     toIdentifier(text.slice(0, -s.length)),
                            status: statusMap[s],
                        });
                        break;
                    }
                }
            }
        }
    }

    if (result.date == null && result.effectiveDate!.tabletop != null) {
        result.date = result.effectiveDate?.tabletop;
    }

    if (
        result.effectiveDate!.tabletop == null
        && result.effectiveDate!.online == null
        && result.effectiveDate!.arena == null
    ) {
        result.effectiveDate = undefined;
    }

    return result as IFormatAnnouncement;
}

export async function parseWizardsOldBanlist(url: string): Promise<IFormatAnnouncement> {
    const html = await request(url);
    const $ = cheerio.load(html);

    const content = $('#bodycontent');

    const result: Partial<IFormatAnnouncement> = {
        source:        'wotc',
        date:          undefined,
        nextDate:      undefined,
        effectiveDate: { },
        link:          [url],
        changes:       [],
    };

    let currFormat: string | null = null;
    let currChange: IFormatAnnouncement['changes'][0] | undefined;

    for (const e of getLines(content, $)) {
        const text = e.map(v => $(v).text()).join('').trim();

        if (isStrong(e[0])) {
            const sText = (t => (t.endsWith(':') ? t.slice(0, -1) : t))(
                e.filter(isStrong).map(v => $(v).text().trim()).join(''),
            );

            const rest = text.replace(new RegExp(`${escapeRegExp(sText)}:?`), '').trim();

            const newFormat = parseDateText(sText, rest, result);

            if (newFormat !== undefined) {
                currFormat = newFormat;

                if (!result.changes!.some(c => c.format === currFormat)) {
                    result.changes!.push({
                        format:  currFormat!,
                        banlist: [],
                    });
                }

                currChange = result.changes!.find(c => c.format === currFormat);
            }
        } else if (e[0].tagName === 'h3') {
            currFormat = formatMap[$(e[0]).text()];

            if (!result.changes!.some(c => c.format === currFormat)) {
                result.changes!.push({
                    format:  currFormat!,
                    banlist: [],
                });
            }

            currChange = result.changes!.find(c => c.format === currFormat);
        } else if (currFormat != null) {
            for (const s of Object.keys(statusMap)) {
                if (s !== '' && s !== 'banned') {
                    if (text.endsWith(s)) {
                        currChange!.banlist!.push({
                            id:     toIdentifier(text.slice(0, -s.length)),
                            status: statusMap[s],
                        });
                        break;
                    } else if (text.endsWith(`${s}.`)) {
                        currChange!.banlist!.push({
                            id:     toIdentifier(text.slice(0, -s.length - 1)),
                            status: statusMap[s],
                        });
                        break;
                    }
                }
            }
        }
    }

    return result as IFormatAnnouncement;
}
