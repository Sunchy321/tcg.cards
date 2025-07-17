import cheerio from 'cheerio';
import request from 'request-promise-native';

import { Announcement as IFormatAnnouncement, Legality } from '@interface/magic/format-change';

import { toIdentifier } from '@common/util/id';
import { parseDate, getLines } from './helper';

const monthMap: Record<string, string> = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
};

const statusMap: Record<string, Legality> = {
    'is now banned':                      'banned',
    'is banned':                          'banned',
    'is now banned as a commander only':  'banned_as_commander',
    'is now banned as as commander only': 'banned_as_commander',
    'is banned as a commander':           'banned_as_commander',
    'is now legal':                       'legal',
    'is allowed':                         'legal',
    'is unbanned':                        'legal',
    'is unbanned as a commander':         'legal',
};

export async function parseDuelCommanderBanlist(url: string): Promise<IFormatAnnouncement> {
    const html = await request(url);
    const $ = cheerio.load(html);

    const content = $('.single-post');

    const result: Partial<IFormatAnnouncement> = {
        source:        'duelcommander',
        effectiveDate: {},
        link:          [url],
        changes:       [
            {
                format:  'duelcommander',
                banlist: [],
            },
        ],
    };

    const year = url.substr(url.search(/\d{4}/), 4);
    const month = monthMap[$('p.month').text()];
    const day = $('p.date').text().padStart(2, '0');

    result.date = `${year}-${month}-${day}`;

    for (const e of getLines(content, $)) {
        const text = e
            .map(v => $(v).text())
            .join('')
            .trim();

        let isChange = false;

        let mStatus = null;

        for (const s of Object.keys(statusMap)) {
            if ((mStatus = new RegExp(`${s}\\.?$`, 'i').exec(text)) != null) {
                const id = toIdentifier(text.slice(0, -mStatus[0].length));

                if (id.length <= 80) {
                    result.changes![0].banlist!.push({
                        id,
                        status: statusMap[s],
                    });
                }

                isChange = true;
                break;
            }
        }

        if (!isChange) {
            const eDate = /(?:These changes apply|This update applies|These changes take effect|This change takes effect|They take effect) on ([a-z]+ \d+(?:st|nd|rd|th)?,? \d+)/i.exec(
                text,
            );

            if (eDate != null) {
                result.effectiveDate!.tabletop = parseDate(eDate[1]);
            }

            const nDate = /(?:The next announcements? will be published|The next announcement is expected to be|See you all) on ([a-z]+ \d+(?:st|nd|rd|th)?, \d+)/i.exec(
                text,
            );

            if (nDate != null) {
                result.nextDate = parseDate(nDate[1]);
                break;
            }
        }
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
