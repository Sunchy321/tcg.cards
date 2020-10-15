/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Clone, Commit, Repository, Reset, Revwalk } from 'nodegit';

import { XCardDefs, XEntity, XLocStringTag, XTag } from './interface';

import * as fs from 'fs';
import * as path from 'path';
import { xml2js } from 'xml-js';
import { castArray } from 'lodash';

import { data } from '@config';
import * as logger from '@/logger';

import Patch from '@/hearthstone/db/patch';
import Entity, { IEntityData, IPlayRequirement, IPower } from '@/hearthstone/db/entity';

import {
    classes,
    factions,
    mechanics,
    multiClasses,
    playRequirements,
    puzzleTypes,
    raceBuckets,
    races,
    rarities,
    referencedTags,
    sets,
    tags,
    types,
    ITag,
} from '@data/hearthstone/hsdata-map';

const remoteUrl = 'https://github.com/HearthSim/hsdata';
const localPath = path.join(data, 'hearthstone', 'hsdata');

export function hasData(): boolean {
    return fs.existsSync(path.join(localPath, '.git'));
}

export async function getData(): Promise<void> {
    if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
    }

    if (!fs.existsSync(path.join(localPath, '.git'))) {
        await Clone.clone(remoteUrl, localPath);

        logger.data.info('Hsdata has been cloned', { category: 'hsdata' });
    } else {
        const repo = await Repository.open(localPath);

        await repo.fetchAll();
        await repo.mergeBranches('master', 'origin/master');

        logger.data.info('Hsdata has been pulled', { category: 'hsdata' });
    }
}

const messagePrefix = 'Update to patch';

export async function loadData(): Promise<void> {
    const repo = await Repository.open(localPath);

    const walker = Revwalk.create(repo);

    walker.pushHead();

    const commits = await walker.getCommitsUntil((c: Commit) =>
        c.message().startsWith(messagePrefix),
    );

    for (const c of commits.slice(0, -1)) {
        const version = c.message().slice(messagePrefix.length).trim();
        const sha = c.sha();

        const patch = await Patch.findOne({ version });

        if (patch == null) {
            const newPatch = new Patch({
                version,
                sha,
            });

            await newPatch.save();
        }
    }
}

let patchStatus: {
    version?: string;
    count?: number;
} = {};

export async function loadPatch(version: string): Promise<void> {
    try {
        if (!hasData()) {
            return;
        }

        if (patchStatus.version != null) {
            return;
        }

        patchStatus = {
            version,
            count: 0,
        };

        const patch = await Patch.findOne({ version });

        if (patch == null) {
            return;
        }

        await Entity.deleteMany({ version });

        const repo = await Repository.open(localPath);

        const commit = await repo.getCommit(patch.sha);

        await Reset.reset(repo, commit, Reset.TYPE.HARD, {});

        const xml = fs
            .readFileSync(path.join(localPath, 'CardDefs.xml'))
            .toString();

        const cardDefs = xml2js(xml, {
            compact:           true,
            ignoreDeclaration: true,
            ignoreComment:     true,
        }) as { CardDefs: XCardDefs };

        const failure: string[] = [];

        const entities = cardDefs.CardDefs.Entity.map(e => {
            try {
                return convertEntity(e, version);
            } catch (e) {
                failure.push(e.message);
                return {};
            }
        });

        if (failure.length !== 0) {
            throw new Error(failure.join('\n'));
        }

        const dbfIndexes: (keyof IEntityData)[] = [
            'countAsCopyOf',
            'heroicHeroPower',
            'mouseOverCard',
            'questReward',
            'relatedCardInCollection',
            'swapTo',
            'tripleCard',
            'twinspellCopy',
            'upgradedPower',
        ];

        // find card id by dbf id
        for (const e of entities) {
            const indexes = dbfIndexes.filter(i => e[i] != null);

            if (indexes.length != null) {
                for (const i of indexes) {
                    for (const e0 of entities) {
                        if (e0.dbfId === e[i] as number) {
                            (e as any)[i] = e0.cardId;
                        }
                    }
                }
            }
        }

        await Entity.insertMany(entities);

        patch.isUpdated = true;

        await patch.save();

        patchStatus = {};

        logger.data.info(`Patch ${version} has been loaded`, {
            category: 'hsdata',
        });
    } catch (e) {
        patchStatus = {};
        throw e;
    }
}

function getValue(tag: XTag | XLocStringTag, info: ITag) {
    if (tag._attributes.type === 'LocString') {
        return Object.entries(tag)
            .filter(v => v[0] !== '_attributes')
            .map(v => ({
                lang:  v[0],
                value: v[1]._text,
            }));
    } else {
        if (info.bool) {
            const value = tag._attributes.value;

            if (value !== '') {
                throw new Error(`Tag ${info.index} with non-1 value`);
            } else {
                return true;
            }
        } else if (info.enum) {
            const enumId = info.enum === true ? info.index : info.enum;
            const id = tag._attributes.value;

            switch (enumId) {
            case 'set':
                return sets[id];
            case 'class':
                return classes[id];
            case 'multiClass':
                return multiClasses[id];
            case 'type':
                return types[id];
            case 'race':
                return races[id];
            case 'raceBucket':
                return raceBuckets[id];
            case 'mechanic':
                return mechanics[id];
            case 'puzzleType':
                return puzzleTypes[id];
            case 'referencedTag':
                return referencedTags[id];
            case 'playRequirement':
                return playRequirements[id];
            case 'rarity':
                return rarities[id];
            case 'faction':
                return factions[id];
            default:
                throw new Error(`Unknown enum ${enumId}`);
            }
        } else {
            switch (tag._attributes.type as string) {
            case 'Int':
                return parseInt(tag._attributes.value);
            case 'String':
                return tag._text!;
            case 'Card':
                // use hsdata attribute here
                return tag._attributes.cardID!;
            default:
                throw new Error(`New object type ${tag._attributes.type}`);
            }
        }
    }
}

function convertEntity(e: XEntity, version: string) {
    const entity: Partial<IEntityData> = { version };

    const cardId = e._attributes.CardID;

    entity.classes = [];
    entity.mechanics = [];

    try {
        const keys = Object.keys(e);

        if (
            keys.some(
                k =>
                    ![
                        '_attributes',
                        'Tag',
                        'Power',
                        'ReferencedTag',
                        'EntourageCard',
                        'MasterPower',
                        'TriggeredPowerHistoryInfo',
                    ].includes(k),
            )
        ) {
            throw new Error(`Unknown key in ${cardId}`);
        }

        const attr = e._attributes;

        entity.cardId = attr.CardID;
        entity.dbfId = parseInt(attr.ID);

        const tagElems = e.Tag;

        if (tagElems != null) {
            for (const t of castArray(tagElems)) {
                const id = t._attributes.enumID;

                const tag = tags[id];

                if (tag != null) {
                    const value = getValue(t, tag);

                    if (tag.array) {
                        if (entity[tag.index] == null) {
                            (entity as any)[tag.index] = [];
                        }

                        (entity as any)[tag.index].push(value);
                    } else {
                        (entity as any)[tag.index] = value;
                    }

                    continue;
                }

                const raceBucket = raceBuckets[id];

                if (raceBucket != null) {
                    entity.raceBucket = raceBucket;
                    continue;
                }

                try {
                    const mechanic = mechanics[id];

                    const type = t._attributes.type;

                    if (type !== 'Int' && type !== 'Card') {
                        throw new Error(
                            `Incorrect type ${type} of mechanic ${mechanic}`,
                        );
                    }

                    const value = parseInt((t as XTag)._attributes.value);

                    if (mechanic != null) {
                        switch (mechanic) {
                        case 'drag_minion':
                            if (value === 1) {
                                entity.mechanics.push('drag_minion_to_buy');
                            } else if (value === 2) {
                                entity.mechanics.push(
                                    'drag_minion_to_sell',
                                );
                            } else {
                                throw new Error(
                                    `Mechanic ${mechanic} with non-1 value`,
                                );
                            }
                            break;
                        case 'jade_golem':
                            if (entity.referencedTags == null) {
                                entity.referencedTags = [];
                            }

                            entity.referencedTags.push('jade_golem');
                            break;
                        case 'quest':
                            if (entity.isQuest !== 'side') {
                                entity.isQuest = true;
                            }
                            break;
                        case 'sidequest':
                            entity.isQuest = 'side';
                            break;
                        case 'windfury':
                            if (value === 1) {
                                entity.mechanics.push(mechanic);
                            } else if (value === 3) {
                                entity.mechanics.push('mega_windfury');
                            } else {
                                throw new Error(
                                    `Mechanic ${mechanic} with non-1 value`,
                                );
                            }
                            break;

                        case 'buff_attack_up':
                        case 'buff_cost_down':
                        case 'buff_cost_up':
                        case 'buff_health_up':
                        case 'buff_durability_up':
                        case 'discard_cards':
                        case 'game_button':
                        case 'overload':
                        case 'spell_power':
                            entity.mechanics.push(mechanic + ':' + value);
                            break;

                        case 'base_galakrond':
                        case 'hide_stats':
                        case 'hide_watermark':
                            entity.mechanics.push(mechanic);
                            break;

                        default:
                            if (value === 1 || mechanic.startsWith('?')) {
                                entity.mechanics.push(mechanic);
                            } else {
                                throw new Error(
                                    `Mechanic ${mechanic} with non-1 value`,
                                );
                            }
                        }
                    }
                } catch (e) {
                    e.message += ` <${t._attributes.name}>`;
                    throw e;
                }
            }
        }

        const powers = e.Power;

        if (powers != null) {
            entity.powers = [];

            for (const p of castArray(powers)) {
                const power: Partial<IPower> = {};

                power.definition = p._attributes.definition;

                if (p.PlayRequirement != null) {
                    power.playRequirements = [];

                    for (const r of castArray(p.PlayRequirement)) {
                        const type = playRequirements[r._attributes.enumID];

                        const param = r._attributes.param;

                        if (type == null) {
                            throw new Error(
                                `Unknown play requirements ${r._attributes.reqID} in ${cardId}`,
                            );
                        }

                        const req: Partial<IPlayRequirement> = { type };

                        if (param !== '') {
                            req.param = parseInt(param);
                        }

                        power.playRequirements.push(req as IPlayRequirement);
                    }
                }

                entity.powers.push(power as IPower);
            }
        }

        const rtagElems = e.ReferencedCard;

        if (rtagElems != null) {
            if (entity.referencedTags == null) {
                entity.referencedTags = [];
            }

            for (const r of castArray(rtagElems)) {
                const id = r._attributes.enumID;

                try {
                    const req = referencedTags[id];

                    const value = r._attributes.value;

                    if (value !== '1') {
                        switch (req) {
                        case 'windfury':
                            if (value === '3') {
                                entity.referencedTags.push('mega_windfury');
                                break;
                            }
                        // fallthrough
                        default:
                            throw new Error(
                                `Referenced tag ${id} with non-1 value`,
                            );
                        }
                    } else {
                        entity.referencedTags.push(req);
                    }
                } catch (e) {
                    e.message += ` <${r._attributes.name}>`;
                    throw e;
                }
            }
        }

        const entourageCard = e.EntourageCard;

        if (entourageCard != null) {
            entity.entourages = castArray(entourageCard).map(
                v => v._attributes.CardID,
            );
        }

        // Replace can't be targeted by spell and hero power with 'elusive'
        if (entity.mechanics != null) {
            const m = entity.mechanics;

            if (
                m.includes('cant_be_targeted_by_spells') &&
                m.includes('cant_be_targeted_by_hero_powers')
            ) {
                m[m.indexOf('cant_be_targeted_by_spells')] = 'elusive';
                m.splice(m.indexOf('cant_be_targeted_by_hero_powers'), 1);
            }
        }

        ++patchStatus.count!;
    } catch (e) {
        e.message += ` [${cardId}]`;
        throw e;
    }

    return entity;
}
