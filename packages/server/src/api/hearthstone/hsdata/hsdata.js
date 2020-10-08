import { Clone, Repository, Reset, Revwalk } from 'nodegit';

import fs from 'fs';
import path from 'path';
import { xml2js } from 'xml-js';
import { castArray } from 'lodash';

import { data } from '@/config';
import * as logger from '@/logger';

import Patch from '~/db/hearthstone/patch';
import HsdataEntity from '~/db/hearthstone/hsdata';

import hsdataMap from '@/data/hearthstone/hsdata-map';
import { fail } from 'assert';

const remoteUrl = 'https://github.com/HearthSim/hsdata';
const localPath = path.join(data, 'hearthstone', 'hsdata');

export function hasData() {
    return fs.existsSync(path.join(localPath, '.git'));
}

export async function getData() {
    if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
    }

    if (!fs.existsSync(path.join(localPath, '.git'))) {
        await Clone(remoteUrl, localPath);

        logger.data.info('Hsdata has been cloned', { category: 'hsdata' });
    } else {
        const repo = await Repository.open(localPath);

        await repo.fetchAll();
        await repo.mergeBranches('master', 'origin/master');

        logger.data.info('Hsdata has been pulled', { category: 'hsdata' });
    }
}

const messagePrefix = 'Update to patch';

export async function loadData() {
    const repo = await Repository.open(localPath);

    const walker = Revwalk.create(repo);

    walker.pushHead();

    const commits = await walker.getCommitsUntil(c =>
        c.message().startsWith(messagePrefix),
    );

    for (let c of commits.slice(0, -1)) {
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

let patchStatus = {};

export async function loadPatch(version) {
    try {
        if (!hasData()) {
            return;
        }

        if (patchStatus.version != null) {
            return;
        }

        patchStatus = {
            version,
        };

        const patch = await Patch.findOne({ version });

        if (patch == null) {
            return;
        }

        await HsdataEntity.deleteMany({ version });

        const repo = await Repository.open(localPath);

        const commit = await repo.getCommit(patch.sha);

        await Reset.reset(repo, commit, Reset.TYPE.HARD);

        const xml = fs.readFileSync(path.join(localPath, 'CardDefs.xml'));

        const json = xml2js(xml, {
            compact: true,
            ignoreDeclaration: true,
            ignoreComment: true,
        });

        let failure = [];

        const entities = json.CardDefs.Entity.map(e => {
            try {
                return convertEntity(e);
            } catch (e) {
                failure.push(e.message);
            }
        });

        if (failure.length !== 0) {
            return {
                failure: failure.join('\n'),
            };
        }

        const dbfIndexes = [
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
        for (let e of entities) {
            const indexes = dbfIndexes.filter(i => e[i] != null);

            if (indexes.length != null) {
                for (let i of indexes) {
                    for (let e0 of entities) {
                        if (e0.dbfId === e[i]) {
                            e[i] = e0.cardId;
                        }
                    }
                }
            }
        }

        await HsdataEntity.insertMany(entities);

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

function enumOf(type, value, nullable) {
    const map = hsdataMap[type];

    if (map == null) {
        throw new Error(`Unknown enum type ${type}`);
    }

    const result = map[value];

    if (result === undefined) {
        if (nullable) {
            return undefined;
        } else {
            throw new Error(`Unknown value ${value} of enum ${type}`);
        }
    } else {
        return result;
    }
}

function valueOf(o, forceBoolean) {
    switch (o._attributes.type) {
        case 'Int':
            if (forceBoolean) {
                if (o._attributes.value !== '1') {
                    throw new Error(
                        `Non-boolean value of ${o._attributes.value}`,
                    );
                } else {
                    return true;
                }
            } else {
                return parseInt(o._attributes.value);
            }
        case 'String':
            return o._text;
        case 'Card':
            // use hsdata attribute here
            return o._attributes.cardID;
        case 'LocString':
            return Object.entries(o)
                .filter(v => v[0] !== '_attributes')
                .map(v => ({
                    lang: v[0],
                    value: v[1]._text,
                }));
        default:
            throw new Error(`New object type ${o._attributes.type}`);
    }
}

function convertEntity(e, version) {
    const entity = { version };

    const cardId = e._attributes.CardID;

    entity.classes = [];
    entity.mechanics = [];

    try {
        for (let [k, v] of Object.entries(e)) {
            switch (k) {
                case '_attributes':
                    entity.cardId = v.CardID;
                    entity.dbfId = parseInt(v.ID);
                    break;

                case 'Tag':
                    for (let t of castArray(v)) {
                        const id = t._attributes.enumID;
                        const rawValue = valueOf(t);

                        const tag = enumOf('tag', id, true);

                        if (tag != null) {
                            /*
                                index: name of field assigned
                                bool:  true if the field is a boolean value
                                array: true if the field is an array
                                enum:  non-null if use enum string, not number
                                       true if the enum name is same as index
                            */
                            const { index, bool, array, enum: rawEnumId } = tag;
                            const enumId =
                                rawEnumId === true ? index : rawEnumId;
                            const value =
                                enumId != null
                                    ? enumOf(enumId, rawValue)
                                    : rawValue;

                            if (bool) {
                                if (value !== 1) {
                                    throw new Error(
                                        `Tag ${index} with non-1 value`,
                                    );
                                }

                                entity[index] = true;
                            } else if (array) {
                                if (entity[index] == null) {
                                    entity[index] = [];
                                }

                                entity[index].push(value);
                            } else {
                                entity[index] = value;
                            }

                            continue;
                        }

                        const raceBucket = enumOf('raceBucket', id, true);

                        if (raceBucket != null) {
                            entity.raceBucket = raceBucket;
                            continue;
                        }

                        try {
                            const mechanic = enumOf('mechanic', id);

                            if (mechanic != null) {
                                switch (mechanic) {
                                    case 'drag_minion':
                                        if (rawValue === 1) {
                                            entity.mechanics.push(
                                                'drag_minion_to_buy',
                                            );
                                        } else if (rawValue === 2) {
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

                                        entity.referencedTags.push(
                                            'jade_golem',
                                        );
                                        break;
                                    case 'quest':
                                        if (entity.isQuery !== 'side') {
                                            entity.isQuery = true;
                                        }
                                        break;
                                    case 'sidequest':
                                        entity.isQuery = 'side';
                                        break;
                                    case 'windfury':
                                        if (rawValue === 1) {
                                            entity.mechanics.push(mechanic);
                                        } else if (rawValue === 3) {
                                            entity.mechanics.push(
                                                'mega_windfury',
                                            );
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
                                        entity.mechanics.push(
                                            mechanic + ':' + rawValue,
                                        );
                                        break;

                                    case 'base_galakrond':
                                    case 'hide_stats':
                                    case 'hide_watermark':
                                        entity.mechanics.push(mechanic);
                                        break;

                                    default:
                                        if (
                                            rawValue === 1 ||
                                            mechanic.startsWith('?')
                                        ) {
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
                    break;

                case 'Power':
                    entity.powers = [];

                    for (let p of castArray(v)) {
                        const power = {};

                        power.definition = p._attributes.definition;

                        if (p.PlayRequirement != null) {
                            power.playRequirements = [];

                            for (let r of castArray(p.PlayRequirement)) {
                                const type = enumOf(
                                    'playRequirement',
                                    r._attributes.enumID,
                                );

                                const param = r._attributes.param;

                                if (type == null) {
                                    throw new Error(
                                        `Unknown play requirements ${r._attributes.reqID} in ${cardId}`,
                                    );
                                }

                                const req = { reqType: type };

                                if (param !== '') {
                                    req.param = parseInt(param);
                                }

                                power.playRequirements.push(req);
                            }
                        }

                        entity.powers.push(power);
                    }

                    break;

                case 'ReferencedTag':
                    if (entity.referencedTags == null) {
                        entity.referencedTags = [];
                    }

                    for (let r of castArray(v)) {
                        const id = r._attributes.enumID;

                        try {
                            const req = enumOf('referencedTag', id);

                            const rawValue = valueOf(r);

                            if (rawValue !== 1) {
                                switch (req) {
                                    case 'windfury':
                                        if (rawValue === 3) {
                                            entity.referencedTags.push(
                                                'mega_windfury',
                                            );
                                            break;
                                        }
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

                    break;

                case 'EntourageCard':
                    entity.entourages = castArray(v).map(
                        v => v._attributes.CardID,
                    );
                    break;

                case 'MasterPower':
                case 'TriggeredPowerHistoryInfo':
                    break;

                default:
                    throw new Error(`Unknown Item ${k} in ${cardId}`);
            }
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

        ++patchStatus.count;
    } catch (e) {
        e.message += ` [${cardId}]`;
        throw e;
    }

    return entity;
}
