import Format from '@/magic/db/format';
import Set from '@/magic/db/set';
import FormatChange from '@/magic/db/format-change';
import BanlistChange from '@/magic/db/banlist-change';
import Card from '@/magic/db/card';

import { BanlistChange as IBanlistChange, BanlistStatus } from '@interface/magic/banlist';

type Element<T> = T extends (infer E)[] ? E : never;

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
    group?: string;
    format: string;
    card: string;
    status: BanlistStatus;
    effectiveDate: {
        tabletop?: string;
        online?: string;
        arena?: string;
    };
    link: string[];
}

function cmp<T>(a: T, b: T): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

export async function getChanges(
    id: string | null,
    options: { keepClone?: boolean } = {},
): Promise<(IBanlistChangeItem | IFormatChangeItem)[]> {
    const keepClone = options.keepClone ?? false;

    const format = await Format.findOne(id != null ? { formatId: id } : {});

    if (id != null && format == null) {
        throw new Error(`Unknown format ${id}`);
    }

    const result: (IBanlistChangeItem | IFormatChangeItem)[] = [];

    const banlistAggregate = BanlistChange.aggregate()
        .unwind('changes');

    if (id != null) {
        banlistAggregate.match({ 'changes.format': id });
    }

    const banlistChanges = (await banlistAggregate) as (
        Omit<IBanlistChange, 'changes'> & {
            _id: string;
            changes: Element<IBanlistChange['changes']>;
        }
    )[];

    for (const v of banlistChanges) {
        const { card } = v.changes;

        if (v.changes.detail != null && !(card.startsWith('#{clone') && keepClone)) {
            for (const d of v.changes.detail) {
                result.push({
                    _id:           v._id,
                    type:          'banlist',
                    date:          v.date,
                    category:      v.category,
                    group:         card.startsWith('#{clone') ? d.group : card.slice(1),
                    format:        v.changes.format,
                    card:          d.card,
                    status:        d.status ?? v.changes.status!,
                    effectiveDate: {
                        tabletop: d.date ?? v.changes.effectiveDate ?? v.effectiveDate?.tabletop,
                        online:   d.date ?? v.changes.effectiveDate ?? v.effectiveDate?.online,
                        arena:    d.date ?? v.changes.effectiveDate ?? v.effectiveDate?.arena,
                    },
                    link: v.link,
                });
            }

            continue;
        } else {
            result.push({
                _id:           v._id,
                type:          'banlist',
                date:          v.date,
                category:      v.category,
                format:        v.changes.format,
                card,
                status:        v.changes.status!,
                effectiveDate: {
                    tabletop: v.changes.effectiveDate ?? v.effectiveDate?.tabletop,
                    online:   v.changes.effectiveDate ?? v.effectiveDate?.online,
                    arena:    v.changes.effectiveDate ?? v.effectiveDate?.arena,
                },
                link: v.link,
            });
        }
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
                        'changes.format':   { $exists: false },
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
                        'changes.category': 'release',
                        'changes.format':   { $exists: false },
                        'date':             { $gte: format?.birthday },
                    },
                    {
                        'changes.category': 'release',
                        'changes.format':   'standard',
                        'date':             { $gte: format?.birthday },
                    },
                    {
                        'changes.category': 'rotation',
                        'changes.format':   'standard',
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

const formatWithSet = ['standard', 'historic', 'explorer', 'pioneer', 'modern', 'extended', 'brawl'];
const banlistStatusOrder = ['banned', 'suspended', 'banned_as_commander', 'banned_as_companion', 'restricted', 'legal', 'unavailable'];
const banlistSourceOrder = ['ante', 'offensive', 'conspiracy', 'legendary', null];

export async function syncChange(): Promise<void> {
    const formats = await Format.find();
    const setIds = await Set.find({ setType: { $in: ['expansion', 'core'] } }).distinct('setId');

    const formatMap = Object.fromEntries(formats.map(f => [f.formatId, f]));

    const alchemyBirthday = formatMap.alchemy.birthday!;
    const brawlBirthday = formatMap.brawl.birthday!;

    const changes = await getChanges(null, { keepClone: true });

    for (const format of Object.values(formatMap)) {
        format.sets = [];
        format.banlist = [];
    }

    for (const c of changes) {
        if (c.type === 'format') {
            // format change
            const changedFormats = (() => {
                if (c.category !== 'release') {
                    return [c.format!];
                }

                // released to specific format, such as MH1, HA1
                if (c.format != null) {
                    return [c.format!];
                }

                return formatWithSet.filter(f => {
                    const format = formatMap[f]!;
                    // the change don't become effective now
                    if (c.date > new Date().toLocaleDateString('en-CA')) { return false; }
                    // the change is before the format exists
                    if (format.birthday != null && c.date < format.birthday) { return false; }
                    // the change is after the format died
                    if (format.deathdate != null && c.date > format.deathdate) { return false; }
                    return true;
                });
            })();

            if (changedFormats.includes('standard')) {
                if (!changedFormats.includes('alchemy') && c.date >= alchemyBirthday) {
                    changedFormats.push('alchemy');
                }

                if (!changedFormats.includes('brawl') && c.date >= brawlBirthday) {
                    changedFormats.push('brawl');
                }
            }

            if (changedFormats.includes('alchemy')) {
                if (!changedFormats.includes('historic')) {
                    changedFormats.push('historic');
                }
            }

            if (changedFormats.includes('historic')) {
                if (!changedFormats.includes('historic_brawl')) {
                    changedFormats.push('historic_brawl');
                }
            }

            for (const f of changedFormats) {
                const fo = formatMap[f]!;

                if (fo.sets == null) {
                    fo.sets = [];
                }

                for (const i of c.in) {
                    if (fo.sets.includes(i)) {
                        // Alchemy initial, ignore duplicate
                        if (['historic', 'historic_brawl'].includes(fo.formatId) && c.date === '2021-12-09') {
                            continue;
                        }

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
                    const sets = await Card.find({ cardId: b.card, set: { $in: setIds } }).distinct('set');

                    const setInFormat = sets.filter(s => fo.sets!.includes(s));

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

                        await banlistChange.save();
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

            // clones from other format
            if (c.card.startsWith('#{clone')) {
                const srcFormats = /^#\{clone:(.*)\}/.exec(c.card)![1].split(',');

                const co = (await BanlistChange.findOne({
                    date:    c.date,
                    changes: { $elemMatch: { card: c.card, format: c.format } },
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
                                group:  b.group,
                            });

                            ci.detail.push({
                                card:   b.card,
                                status: c.status ?? b.status,
                                group:  b.group,
                            });
                        }
                    }
                }

                ci.detail.sort((a, b) => cmp(a.card, b.card));

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
                            group:  c.group,
                        });
                    } else {
                        b.status = c.status!;
                        b.date = c.date;
                        b.group = c.group;
                    }
                }
                }
            }
        }
    }

    for (const format of Object.values(formatMap)) {
        if (format.sets?.length === 0) {
            format.sets = undefined;
        }

        format.banlist.sort((a, b) => {
            if (a.status !== b.status) {
                return banlistStatusOrder.indexOf(a.status)
                    - banlistStatusOrder.indexOf(b.status);
            } else if (a.group !== b.group) {
                return banlistSourceOrder.indexOf(a.group ?? null)
                    - banlistSourceOrder.indexOf(b.group ?? null);
            } else {
                return a.card < b.card ? -1 : 1;
            }
        });

        await format.save();
    }
}
