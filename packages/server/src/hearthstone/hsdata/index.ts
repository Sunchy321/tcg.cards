/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { Clone, Commit, Repository, Reset, Revwalk, TransferProgress } from 'nodegit';

import { XCardDefs, XEntity, XLocStringTag, XTag } from './interface';

import Patch from '@/hearthstone/db/patch';
import Entity, { IEntity, IPlayRequirement, IPower } from '@/hearthstone/db/entity';
import Task from '@/common/task';

import * as fs from 'fs';
import * as path from 'path';
import { js2xml, xml2js } from 'xml-js';
import { castArray, last } from 'lodash';

import { dataPath } from '@static';
import * as logger from '@/logger';

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
    relatedEntities,
} from '@data/hearthstone/hsdata-map';

const remoteUrl = 'https://github.com/HearthSim/hsdata';
const localPath = path.join(dataPath, 'hearthstone', 'hsdata');

function hasData(): boolean {
    return fs.existsSync(path.join(localPath, '.git'));
}

const langMap: Record<string, string> = {
    deDE: 'de',
    enUS: 'en',
    esES: 'es',
    esMX: 'mx',
    frFR: 'fr',
    itIT: 'it',
    jaJP: 'ja',
    koKR: 'ko',
    plPL: 'pl',
    ptBR: 'pt',
    ruRU: 'ru',
    thTH: 'th',
    zhCN: 'zhs',
    zhTW: 'zht',
};

export class DataGetter extends Task<TransferProgress & { type: 'get' }> {
    async startImpl(): Promise<void> {
        if (!fs.existsSync(localPath)) {
            fs.mkdirSync(localPath, { recursive: true });
        }

        if (!fs.existsSync(path.join(localPath, '.git'))) {
            await Clone.clone(remoteUrl, localPath, {
                fetchOpts: {
                    callbacks: {
                        transferProgress: (progress: any) => {
                            this.emit('progress', {
                                type:            'git',
                                totalObjects:    progress.totalObjects(),
                                indexedObjects:  progress.indexedObjects(),
                                receivedObjects: progress.receivedObjects(),
                                localObjects:    progress.localObjects(),
                                totalDeltas:     progress.totalDeltas(),
                                indexedDeltas:   progress.indexedDeltas(),
                                receivedBytes:   progress.receivedBytes(),
                            });
                        },
                    },
                },
            });

            logger.data.info('Hsdata has been cloned', { category: 'hsdata' });
        } else {
            const repo = await Repository.open(localPath);

            await repo.fetchAll({
                callbacks: {
                    transferProgress: (progress: any) => {
                        this.emit('progress', {
                            type:            'git',
                            totalObjects:    progress.totalObjects(),
                            indexedObjects:  progress.indexedObjects(),
                            receivedObjects: progress.receivedObjects(),
                            localObjects:    progress.localObjects(),
                            totalDeltas:     progress.totalDeltas(),
                            indexedDeltas:   progress.indexedDeltas(),
                            receivedBytes:   progress.receivedBytes(),
                        });
                    },
                },
            });

            await repo.mergeBranches('master', 'origin/master');

            logger.data.info('Hsdata has been pulled', { category: 'hsdata' });
        }
    }

    stopImpl(): void { /* no-op */ }
}

export interface ILoaderStatus {
    type: 'load',
    count: number,
    total: number
}

const messagePrefix = 'Update to patch';

export class DataLoader extends Task<ILoaderStatus> {
    async startImpl(): Promise<void> {
        const repo = await Repository.open(localPath);

        const walker = Revwalk.create(repo);

        walker.pushHead();

        const commits: Commit[] = await walker.getCommitsUntil((c: Commit) =>
            c.message().startsWith(messagePrefix),
        );

        let count = 0;
        const total = commits.length - 1;

        for (const c of commits.slice(0, -1)) {
            const version = c.message().slice(messagePrefix.length).trim();
            const number = parseInt(last(version.split('.'))!);
            const sha = c.sha();

            const patch = await Patch.findOne({ version });

            if (patch == null) {
                const newPatch = new Patch({ version, number, sha });

                await newPatch.save();
                ++count;

                this.emit('progress', { type: 'load', count, total });
            }
        }
    }

    stopImpl(): void { /* no-op */ }
}

function getValue(tag: XTag | XLocStringTag, info: ITag) {
    if (tag._attributes.type === 'LocString') {
        return Object.entries(tag)
            .filter(v => v[0] !== '_attributes')
            .map(v => ({
                lang:  langMap[v[0]] || v[0].slice(2),
                value: v[1]._text,
            }));
    } else {
        if (info.bool) {
            const value = tag._attributes.value;

            if (value !== '1') {
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

export interface ILoadPatchStatus {
    type: 'load-patch';
    version: string;
    count: number;
    total: number;
}

export class PatchLoader extends Task<ILoadPatchStatus> {
    version: number;

    constructor(version: string) {
        super();
        this.version = parseInt(last(version.split('.'))!);
    }

    async startImpl(): Promise<void> {
        if (!hasData()) {
            return;
        }

        const patch = await Patch.findOne({ number: this.version });

        if (patch == null) {
            return;
        }

        await Entity.deleteMany({ version: this.version });

        const repo = await Repository.open(localPath);

        const commit = await repo.getCommit(patch.sha);

        await Reset.reset(repo, commit, Reset.TYPE.HARD, {});

        const text = fs
            .readFileSync(path.join(localPath, 'CardDefs.xml'))
            .toString();

        const xml = xml2js(text, {
            compact:           true,
            ignoreDeclaration: true,
            ignoreComment:     true,
        }) as { CardDefs: XCardDefs };

        let count = 0;
        const total = xml.CardDefs.Entity.length;

        const entities: IEntity[] = [];

        for (const e of xml.CardDefs.Entity) {
            try {
                const entity = this.convert(e);

                ++count;

                if (count % 500 === 0) {
                    this.emit('progress', {
                        type:    'load-patch',
                        version: this.version,
                        count,
                        total,
                    });
                }

                entities.push(entity as IEntity);
            } catch (err) {
                this.emit('error', {
                    message: err.message,
                    entity:  js2xml(e),
                });
            }
        }

        this.emit('progress', {
            type:    'load-patch',
            version: this.version,
            count,
            total,
        });

        for (const e of entities) {
            for (const r of e.relatedEntities) {
                r.cardId = entities.find(e => e.dbfId.toString() === r.cardId)?.cardId || '';
            }
        }

        await Entity.insertMany(entities);

        patch.isUpdated = true;

        await patch.save();

        logger.data.info(`Patch ${this.version} has been loaded`, { category: 'hsdata' });
    }

    convert(entity: XEntity): IEntity {
        const result: Partial<IEntity> = { };

        result.version = this.version;
        result.cardId = entity._attributes.CardID;
        result.dbfId = parseInt(entity._attributes.ID);

        result.classes = [];
        result.mechanics = [];
        result.referencedTags = [];
        result.relatedEntities = [];

        const quest: { type ?: true | 'side', progress ?: number } = {};

        for (const k in entity) {
            switch (k) {
            case '_attributes':
                break;
            case 'Tag': {
                for (const t of castArray(entity[k])) {
                    const id = t._attributes.enumID;

                    const tag = tags[id];

                    if (tag != null) {
                        const value = getValue(t, tag);

                        if (tag.array) {
                            if (result[tag.index] == null) {
                                (result as any)[tag.index] = [];
                            }

                            (result as any)[tag.index].push(value);
                        } else {
                            (result as any)[tag.index] = value;
                        }

                        continue;
                    }

                    const raceBucket = raceBuckets[id];

                    if (raceBucket != null) {
                        result.raceBucket = raceBucket;
                        continue;
                    }

                    const relatedEntity = relatedEntities[id];

                    if (relatedEntities != null) {
                        result.relatedEntities.push({
                            relation: relatedEntity,
                            cardId:   (t as XTag)._attributes.value,
                        });

                        continue;
                    }

                    const mechanic = mechanics[id];

                    const type = t._attributes.type;

                    if (type !== 'Int' && type !== 'Card') {
                        throw new Error(`Incorrect type ${type} of mechanic ${mechanic}`);
                    }

                    const value = parseInt((t as XTag)._attributes.value);

                    if (mechanic != null) {
                        switch (mechanic) {
                        case 'windfury':
                            if (value === 1) {
                                result.mechanics.push(mechanic);
                            } else if (value === 3) {
                                result.mechanics.push('mega_windfury');
                            } else {
                                throw new Error(`Mechanic ${mechanic} with non-1 value`);
                            }
                            break;
                        case 'jade_golem':
                            result.referencedTags.push('jade_golem');
                            break;
                        case 'quest':
                            if (quest.type == null) {
                                quest.type = true;
                            }

                            result.mechanics.push('quest');
                            break;
                        case 'sidequest':
                            quest.type = 'side';
                            break;
                        case 'quest_progress':
                            quest.progress = value;
                            break;
                        case 'puzzle_type':
                            result.mechanics[result.mechanics.indexOf('puzzle')!] = 'puzzle:' + puzzleTypes[value];
                            break;
                        case 'drag_minion':
                            if (value === 1) {
                                result.mechanics.push('drag_minion_to_buy');
                            } else if (value === 2) {
                                result.mechanics.push('drag_minion_to_sell');
                            } else {
                                throw new Error(`Mechanic ${mechanic} with non-1 value`);
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
                            result.mechanics.push(mechanic + ':' + value);
                            break;

                        case 'base_galakrond':
                        case 'hide_stats':
                        case 'hide_watermark':
                            result.mechanics.push(mechanic);
                            break;

                        default:
                            if (value === 1 || mechanic.startsWith('?')) {
                                result.mechanics.push(mechanic);
                            } else {
                                throw new Error(`Mechanic ${mechanic} with non-1 value`);
                            }
                        }
                    }
                }

                const m = result.mechanics;

                if (quest.type != null) {
                    m[m.indexOf('quest')] =
                        quest.type === 'side' ? `quest:side,${quest.progress}` : `quest:${quest.progress}`;
                }

                if (
                    m.includes('cant_be_targeted_by_spells') &&
                    m.includes('cant_be_targeted_by_hero_powers')
                ) {
                    m[m.indexOf('cant_be_targeted_by_spells')] = 'elusive';
                    m.splice(m.indexOf('cant_be_targeted_by_hero_powers'), 1);
                }

                break;
            }
            case 'Power': {
                result.powers = [];

                for (const p of castArray(entity[k])) {
                    const power: Partial<IPower> = {};

                    power.definition = p._attributes.definition;

                    if (p.PlayRequirement != null) {
                        power.playRequirements = [];

                        for (const r of castArray(p.PlayRequirement)) {
                            const type = playRequirements[r._attributes.enumID];

                            const param = r._attributes.param;

                            if (type == null) {
                                throw new Error(
                                    `Unknown play requirements ${r._attributes.reqID}`,
                                );
                            }

                            const req: Partial<IPlayRequirement> = { type };

                            if (param !== '') {
                                req.param = parseInt(param);
                            }

                            power.playRequirements.push(req as IPlayRequirement);
                        }
                    }

                    result.powers.push(power as IPower);
                }

                break;
            }
            case 'ReferencedTag': {
                result.referencedTags = [];

                for (const r of castArray(entity[k])) {
                    const id = r._attributes.enumID;

                    try {
                        const req = referencedTags[id];

                        const value = r._attributes.value;

                        if (value !== '1') {
                            switch (req) {
                            case 'windfury':
                                if (value === '3') {
                                    result.referencedTags.push('mega_windfury');
                                    break;
                                }
                                // fallthrough
                            default:
                                throw new Error(
                                    `Referenced tag ${id} with non-1 value`,
                                );
                            }
                        } else {
                            result.referencedTags.push(req);
                        }
                    } catch (e) {
                        e.message += ` <${r._attributes.name}>`;
                        throw e;
                    }
                }

                break;
            }
            case 'EntourageCard': {
                result.entourages = castArray(entity[k]).map(
                    v => v._attributes.CardID,
                );

                break;
            }

            default:
                throw new Error(`Unknown key ${k}`);
            }
        }

        return result as IEntity;
    }

    stopImpl(): void { /* no-op */ }
}
