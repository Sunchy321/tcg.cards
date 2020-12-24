export const monthMap: Record<string, string> = {
    January:   '01',
    February:  '02',
    March:     '03',
    April:     '04',
    May:       '05',
    June:      '06',
    July:      '07',
    August:    '08',
    September: '09',
    October:   '10',
    Oct:       '10',
    November:  '11',
    Nov:       '11',
    December:  '12',
};

export function parseDate(text: string): string {
    const m = /^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), )?([a-z]+) (\d+)(?:st|nd|rd|th)?,? (\d+)( at 12 p.m. PT)?/i.exec(text.trim());

    if (m == null || monthMap[m[1]] == null) {
        return '<' + text + '>';
    } else {
        let mainDate = `${m[3]}-${monthMap[m[1]]}-${m[2].padStart(2, '0')}`;

        if (m[4] != null) {
            mainDate += ' 12:00 PT';
        }

        return mainDate;
    }
}

function* flat(div: cheerio.Cheerio, $: cheerio.Root): Generator<cheerio.TagElement | 'newline'> {
    for (const i of div.contents().get()) {
        switch (i.tagName) {
        case 'p':
            yield 'newline';

            for (const e of flat($(i), $)) {
                yield e;
            }

            yield 'newline';
            break;
        case 'ul':
            for (const e of $(i).children().get()) {
                for (const r of flat($(e), $)) {
                    yield r;
                }

                yield 'newline';
            }

            break;
        case 'li':
            for (const e of flat($(i), $)) {
                yield e;
            }

            yield 'newline';
            break;
        default:
            yield i;
        }
    }
}

export function* getLines(div: cheerio.Cheerio, $: cheerio.Root): Generator<cheerio.TagElement[]> {
    const result: cheerio.TagElement[] = [];

    for (const i of flat(div, $)) {
        if (i === 'newline') {
            if (result.length > 0) {
                yield result;
                result.splice(0, result.length);
            }
        } else {
            switch (i.tagName) {
            case 'h2':
            case 'h3':
                if (result.length > 0) {
                    yield result;
                    result.splice(0, result.length);
                }

                yield [i];
                break;
            case 'br':
                if (
                    result.length > 1 ||
                    (result.length === 1 && result[0].tagName !== 'strong')
                ) {
                    yield result;
                    result.splice(0, result.length);
                }
                break;
            default:
                if (i.tagName == null && $(i).text().trim() === '') {
                    continue;
                }

                result.push(i);
            }
        }
    }
}
