import Format from '@/magic/db/format';
import Set from '@/magic/db/set';
import { BanlistStatus } from './banlist/interface';
import FormatChange from '@/magic/db/format-change';
import BanlistChange from '@/magic/db/banlist-change';
import Card from './db/card';

interface IFormatChangeItem {
    _id: string;
    type: 'format';
    date: string;
    category: string;
    format: string;
    in: string[];
    out: string[];
}

interface IBanlistChangeItem {
    _id: string;
    type: 'banlist';
    date: string;
    category: string;
    source?: string;
    format: string;
    card: string;
    status: string;
    effectiveDate: {
        tabletop?: string;
        online?: string;
        arena?: string;
    },
    link: string[];
}

export async function getChanges(
    id: string | null,
    options: { keepClone?: boolean } = {},
): Promise<(IFormatChangeItem | IBanlistChangeItem)[]> {
    const keepClone = options.keepClone ?? false;

    const format = await Format.findOne(id ? { formatId: id } : {});

    if (id != null && format == null) {
        throw new Error('Unknown format ' + id);
    }

    const result: (IFormatChangeItem | IBanlistChangeItem)[] = [];

    const banlistAggregate = BanlistChange.aggregate()
        .unwind('changes');

    if (id != null) {
        banlistAggregate.match({ 'changes.format': id });
    }

    const banlistChanges = await banlistAggregate;

    for (const v of banlistChanges) {
        const card = v.changes.card;

        if (
            v.changes.detail?.length > 0 && !(card.startsWith('#{clone') && keepClone)
        ) {
            for (const d of v.changes.detail) {
                result.push({
                    _id:           v._id,
                    type:          'banlist',
                    date:          v.date,
                    category:      v.category,
                    source:        card.startsWith('#{clone') ? 'clone' : card.slice(1),
                    format:        v.changes.format,
                    card:          d.card,
                    status:        d.status ?? v.changes.status,
                    effectiveDate: {
                        tabletop: d.date ?? v.changes.effectiveDate ?? v.effectiveDate?.tabletop,
                        online:   d.date ?? v.changes.effectiveDate ?? v.effectiveDate?.online,
                        arena:    d.date ?? v.changes.effectiveDate ?? v.effectiveDate?.arena,
                    },
                    link: v.link,
                });
            }

            continue;
        }

        result.push({
            _id:           v._id,
            type:          'banlist',
            date:          v.date,
            category:      v.category,
            format:        v.changes.format,
            card,
            status:        v.changes.status,
            effectiveDate: {
                tabletop: v.changes.effectiveDate ?? v.effectiveDate?.tabletop,
                online:   v.changes.effectiveDate ?? v.effectiveDate?.online,
                arena:    v.changes.effectiveDate ?? v.effectiveDate?.arena,
            },
            link: v.link,
        });
    }

    const formatAggregate = FormatChange.aggregate()
        .unwind('changes');

    if (id != null) {
        if (['standard', 'pioneer', 'modern', 'extended'].includes(id)) {
            formatAggregate.match({
                $or: [
                    { 'changes.format': id },
                    {
                        'changes.category': 'release',
                        'date':             format?.deathdate != null
                            ? { $gte: format?.birthday, $lte: format?.deathdate }
                            : { $gte: format?.birthday },
                    },
                ],
            });
        } else if (id === 'brawl') {
            // brawl sets follows standard
            formatAggregate.match({
                $or: [
                    { 'changes.format': 'brawl' },
                    {
                        'changes.category': 'rotation',
                        'changes.format':   'standard',
                        'date':             { $gte: format?.birthday },
                    },
                    {
                        'changes.category': 'release',
                        'date':             { $gte: format?.birthday },
                    },
                ],
            });
        } else {
            formatAggregate.match({ 'changes.format': id });
        }
    }

    const formatChanges = await formatAggregate;

    result.push(...formatChanges.map(v => ({
        _id:      v._id,
        type:     'format',
        date:     v.date,
        category: v.changes.category,
        format:   v.changes.format,
        in:       v.changes.in,
        out:      v.changes.out,
    } as IFormatChangeItem)));

    result.sort((a, b) => {
        if (a.date < b.date) { return -1; }
        if (a.date > b.date) { return 1; }
        if (a.type === 'format' && b.type === 'banlist') { return -1; }
        if (a.type === 'banlist' && b.type === 'format') { return 1; }
        return 0;
    });

    return result;
}

const formatWithSet = ['standard', 'historic', 'pioneer', 'modern', 'extended', 'brawl'];
const banlistStatusOrder = ['banned', 'suspended', 'banned_as_commander', 'banned_as_companion', 'restricted', 'legal', 'unavailable'];
const banlistSourceOrder = ['ante', 'conspiracy', 'legendary', null];

export async function syncChange(): Promise<void> {
    const formats = await Format.find();
    const setIds = await Set.find({ setType: { $in: ['expansion', 'core'] } }).distinct('setId');

    const formatMap = Object.fromEntries(formats.map(f => [f.formatId, f]));

    const changes = await getChanges(null, { keepClone: true });

    for (const f in formatMap) {
        formatMap[f].sets = [];
        formatMap[f].banlist = [];
    }

    for (const c of changes) {
        if (c.type === 'format') {
            // format change
            const formats = c.category !== 'release'
                ? [c.format!]
                : formatWithSet.filter(f => {
                    const format = formatMap[f]!;

                    if (c.date > new Date().toLocaleDateString('en-CA')) {
                        return false;
                    }

                    if (format.birthday != null && c.date < format.birthday) {
                        return false;
                    }

                    if (format.deathdate != null && c.date > format.deathdate) {
                        return false;
                    }

                    return true;
                });

            // brawl sets follows standard
            if (formats.includes('standard') && !formats.includes('brawl') && c.date >= '2018-03-22') {
                formats.push('brawl');
            }

            for (const f of formats) {
                const fo = formatMap[f]!;

                for (const i of c.in) {
                    if (fo.sets.includes(i)) {
                        throw new Error(`In set ${i} is already in ${f}, date: ${c.date}`);
                    }
                }

                fo.sets.push(...c.in);

                if (c.out.length === 0) {
                    continue;
                }

                for (const o of c.out) {
                    if (!fo.sets.includes(o)) {
                        throw new Error(`Out set ${o} is not in ${f}, date: ${c.date}`);
                    }
                }

                // rotated banlist item
                const banlistRemoved: string[] = [];

                for (const b of fo.banlist) {
                    const sets = await Card.find({ cardId: b.card, setId: { $in: setIds } }).distinct('setId');

                    const setInFormat = sets.filter(s => fo.sets.includes(s));

                    if (setInFormat.every(s => c.out.includes(s))) {
                        banlistRemoved.push(b.card);
                    }
                }

                if (banlistRemoved.length > 0) {
                    const banlistChange = await BanlistChange.findOne({
                        date:     c.date,
                        category: 'rotation',
                    });

                    if (banlistChange != null) {
                        for (const b of banlistRemoved) {
                            if (!banlistChange.changes.some(c => c.card === b && c.format === f)) {
                                banlistChange.changes.push({
                                    card:   b,
                                    format: f,
                                    status: 'unavailable',
                                });
                            }
                        }
                    } else {
                        await BanlistChange.create({
                            date:     c.date,
                            category: 'rotation',
                            link:     [],
                            changes:  banlistRemoved.map(b => ({
                                card:   b,
                                format: f,
                                status: 'unavailable' as BanlistStatus,
                            })),
                        });
                    }

                    fo.banlist = fo.banlist.filter(b => !banlistRemoved.includes(b.card));
                }

                fo.sets = fo.sets.filter(s => !c.out.includes(s));
            }
        } else {
            // banlist change
            const fo = formatMap[c.format];

            if (fo == null) {
                continue;
            }

            if (c.card.startsWith('#{clone')) {
                const m = /^#\{clone:(.*)\}/.exec(c.card)!;

                const srcFormats = m[1].split(',');

                const co = (await BanlistChange.findOne({
                    date:    c.date,
                    changes: {
                        $elemMatch: {
                            card:   c.card,
                            format: c.format,
                        },
                    },
                }))!;

                const ci = co.changes.find(ch => ch.card === c.card && ch.format === c.format)!;

                ci.detail = [];

                for (const f of srcFormats) {
                    for (const b of formatMap[f].banlist) {
                        if (!fo.banlist.some(bf => bf.card === b.card)) {
                            fo.banlist.push({
                                card:   b.card,
                                status: c.status ?? b.status,
                                date:   c.date,
                                source: b.source,
                            });

                            ci.detail.push({
                                card:   b.card,
                                status: c.status ?? b.status,
                            });
                        }
                    }
                }

                ci.detail.sort((a, b) => {
                    if (a.card < b.card) {
                        return -1;
                    } else if (a.card > b.card) {
                        return 1;
                    } else {
                        return 0;
                    }
                });

                await co.save();
            } else {
                switch (c.status) {
                case 'legal':
                case 'unavailable':
                    fo.banlist = fo.banlist.filter(b => b.card !== c.card);
                    break;
                default: {
                    const b = fo.banlist.find(b => b.card === c.card);

                    if (b == null) {
                        fo.banlist.push({
                            card:   c.card,
                            status: c.status!,
                            date:   c.date,
                            source: c.source,
                        });
                    } else {
                        b.status = c.status!;
                        b.date = c.date;
                    }
                }
                }
            }
        }
    }

    for (const f in formatMap) {
        formatMap[f].banlist.sort((a, b) => {
            if (a.status !== b.status) {
                return banlistStatusOrder.indexOf(a.status) -
                    banlistStatusOrder.indexOf(b.status);
            } else if (a.source !== b.source) {
                return banlistSourceOrder.indexOf(a.source ?? null) -
                    banlistSourceOrder.indexOf(b.source ?? null);
            } else {
                return a.card < b.card ? -1 : 1;
            }
        });

        await formatMap[f].save();
    }
}
