import git, { SimpleGitProgressEvent, ResetMode } from 'simple-git';

import {
    XCardDefs, XEntity, XLocStringTag, XTag,
} from '@interface/hearthstone/hsdata/xml';

import Patch from '@/hearthstone/db/patch';
import Entity from '@/hearthstone/db/entity';
import Task from '@/common/task';

import { Entity as IEntity, PlayRequirement, Power } from '@interface/hearthstone/entity';

import * as fs from 'fs';
import * as path from 'path';
import { xml2js } from 'xml-js';
import {
    castArray, isEqual, last, omit, uniq,
} from 'lodash';

import { dataPath } from '@static';
import * as logger from '@/logger';

import {
    ITag,
    classes,
    factions,
    mechanics,
    mercenaryRoles,
    multiClasses,
    playRequirements,
    puzzleTypes,
    raceBuckets,
    races,
    rarities,
    sets,
    spellSchools,
    locTags,
    tags,
    types,
    relatedEntities,
} from '@data/hearthstone/hsdata-map';
import { toBucket, toGenerator } from '@/common/to-bucket';

const remoteUrl = 'git@github.com:HearthSim/hsdata.git';
export const localPath = path.join(dataPath, 'hearthstone', 'hsdata');

function hasData(): boolean {
    return fs.existsSync(path.join(localPath, '.git'));
}

export const langMap: Record<string, string> = {
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

export class DataGetter extends Task<SimpleGitProgressEvent & { type: 'get' }> {
    async startImpl(): Promise<void> {
        if (!fs.existsSync(localPath)) {
            fs.mkdirSync(localPath, { recursive: true });
        }

        const repo = git({
            baseDir:  localPath,
            progress: p => {
                this.emit('progress', { type: 'git', ...p });
            },
        });

        if (!fs.existsSync(path.join(localPath, '.git'))) {
            await repo.clone(remoteUrl);

            logger.data.info('Hsdata has been cloned', { category: 'hsdata' });
        } else {
            await repo.fetch(['--all']);
            await repo.reset(ResetMode.HARD, ['origin/master']);

            logger.data.info('Hsdata has been pulled', { category: 'hsdata' });
        }
    }

    stopImpl(): void { /* no-op */ }
}

export interface ILoaderStatus {
    type: 'load';
    count: number;
    total: number;
}

const messagePrefix = 'Update to patch';

export class DataLoader extends Task<ILoaderStatus> {
    async startImpl(): Promise<void> {
        const repo = git({
            baseDir:  localPath,
            progress: p => {
                this.emit('progress', { type: 'git', ...p });
            },
        });

        const log = await repo.log();
        const commits = log.all.filter(v => v.message.startsWith(messagePrefix));

        let count = 0;
        const total = commits.length;

        for (const c of commits) {
            const version = c.message.slice(messagePrefix.length).trim();
            const number = Number.parseInt(last(version.split('.'))!, 10);
            const { hash } = c;

            const patch = await Patch.findOne({ version });

            if (patch == null) {
                const newPatch = new Patch({ version, number, hash });

                await newPatch.save();
            } else {
                patch.hash = hash;

                await patch.save();
            }

            count += 1;

            this.emit('progress', { type: 'load', count, total });
        }
    }

    stopImpl(): void { /* no-op */ }
}

export interface IClearPatchStatus {
    type: 'clear-patch';
    version: number;
    count: number;
    total: number;
}

export class PatchClearer extends Task<IClearPatchStatus> {
    version: number;

    constructor(version: number) {
        super();
        this.version = version;
    }

    async startImpl(): Promise<void> {
        if (!hasData()) {
            return;
        }

        const patch = await Patch.findOne({ number: this.version });

        if (patch == null) {
            return;
        }

        let count = 0;
        const total = await Entity.countDocuments({ version: this.version });

        this.intervalProgress(500, () => ({
            type:    'clear-patch',
            version: this.version,
            count,
            total,
        }));

        const entities = await Entity.find({ version: this.version });

        for (const e of entities) {
            if (e.version.length > 1) {
                e.version = e.version.filter(v => v !== this.version);
                await e.save();
            } else {
                await e.delete();
            }

            count += 1;
        }

        patch.isUpdated = false;

        await patch.save();

        logger.data.info(`Patch ${this.version} has been removed`, { category: 'hsdata' });
    }

    stopImpl(): void { /* no-op */ }
}

function getValue(tag: XLocStringTag | XTag, info: ITag) {
    if (tag._attributes.type === 'LocString') {
        return Object.entries(tag)
            .filter(v => v[0] !== '_attributes')
            .map(v => ({
                lang:  langMap[v[0]] || v[0].slice(2),
                value: v[1]._text,
            }));
    } else if (info.bool) {
        const { value } = tag._attributes;

        if (value !== '1') {
            throw new Error(`Tag ${info.index} with non-1 value`);
        } else {
            return true;
        }
    } else if (info.enum != null) {
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
        case 'spellSchool':
            return spellSchools[id];
        case 'raceBucket':
            return raceBuckets[id];
        case 'mechanic':
            return mechanics[id];
        case 'puzzleType':
            return puzzleTypes[id];
        case 'referencedTag':
            return mechanics[id];
        case 'playRequirement':
            return playRequirements[id];
        case 'rarity':
            return rarities[id];
        case 'faction':
            return factions[id];
        case 'mercenaryRole':
            return mercenaryRoles[id];
        default:
            throw new Error(`Unknown enum ${enumId}`);
        }
    } else {
        switch (tag._attributes.type as string) {
        case 'Int':
            return Number.parseInt(tag._attributes.value, 10);
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

export interface ILoadPatchStatus {
    type: 'load-patch';
    version: number;
    count: number;
    total: number;
}

export class PatchLoader extends Task<ILoadPatchStatus> {
    version: number;

    constructor(version: number) {
        super();
        this.version = version;
    }

    async startImpl(): Promise<void> {
        if (!hasData()) {
            return;
        }

        const patch = await Patch.findOne({ number: this.version });

        if (patch == null) {
            return;
        }

        const repo = git({
            baseDir:  localPath,
            progress: p => {
                this.emit('progress', { type: 'git', ...p });
            },
        });

        await repo.reset(ResetMode.HARD, [patch.hash]);

        const text = fs
            .readFileSync(path.join(localPath, 'CardDefs.xml'))
            .toString();

        const xml = xml2js(text, {
            compact:           true,
            ignoreDeclaration: true,
            ignoreComment:     true,
        }) as { CardDefs: XCardDefs };

        const entities: IEntity[] = [];
        const errors: string[] = [];
        const errorPath = path.join(dataPath, 'hearthstone', 'hsdata-error.txt');

        for (const e of xml.CardDefs.Entity) {
            try {
                entities.push(this.convert(e) as IEntity);
            } catch (errs) {
                errors.push(...(errs as string[]).map(err => `${e._attributes.CardID}: ${err}\n`));
            }
        }

        fs.writeFileSync(errorPath, '');

        for (const e of errors) {
            fs.writeFileSync(errorPath, e, { flag: 'a' });
        }

        fs.writeFileSync(errorPath, '-'.repeat(50), { flag: 'a' });

        if (errors.length > 0) {
            return;
        }

        for (const e of entities) {
            for (const r of e.relatedEntities) {
                r.cardId = entities.find(e => e.dbfId.toString() === r.cardId)?.cardId ?? '';
            }
        }

        let count = 0;
        const total = entities.length;

        this.intervalProgress(500, () => ({
            type:    'load-patch',
            version: this.version,
            count,
            total,
        }));

        for (const jsons of toBucket(toGenerator(entities), 500)) {
            const oldData = await Entity.find({ cardId: { $in: jsons.map(j => j.cardId) } });

            for (const e of jsons) {
                const eJson = omit(new Entity(e).toJSON(), ['version']);

                let saved = false;

                for (const o of oldData.filter(o => o.cardId === e.cardId)) {
                    const oJson = omit(o.toJSON(), ['version']);

                    if (isEqual(oJson, eJson)) {
                        o.version = uniq([...o.version, e.version[0]]).sort((a, b) => a - b);
                        await o.save();
                        saved = true;
                        break;
                    }
                }

                if (!saved) {
                    await Entity.create(e);
                }

                count += 1;
            }
        }

        patch.isUpdated = true;

        await patch.save();

        logger.data.info(`Patch ${this.version} has been loaded`, { category: 'hsdata' });
    }

    private convert(entity: XEntity): IEntity {
        const result: Partial<IEntity> = { };
        const masters: string[] = [];
        const errors: string[] = [];

        result.version = [this.version];
        result.cardId = entity._attributes.CardID;
        result.dbfId = Number.parseInt(entity._attributes.ID, 10);

        result.classes = [];
        result.mechanics = [];
        result.referencedTags = [];
        result.relatedEntities = [];

        const localization: Partial<IEntity['localization'][0]>[] = [];
        const quest: Partial<IEntity['quest']> = { };

        for (const k of Object.keys(entity)) {
            switch (k) {
            case '_attributes':
                break;
            case 'Tag': {
                for (const t of castArray(entity[k])) {
                    const id = t._attributes.enumID;

                    const locTag = locTags[id];

                    if (locTag != null) {
                        for (const k of Object.keys(t as XLocStringTag)) {
                            if (k === '_attributes') {
                                continue;
                            }

                            const lang = langMap[k] ?? k.slice(2);
                            const value = (t as any)[k]._text as string;

                            const loc = localization.find(l => l.lang === lang);

                            if (loc != null) {
                                loc[locTag] = value;
                            } else {
                                localization.push({ lang, [locTag]: value });
                            }
                        }

                        continue;
                    }

                    const tag = tags[id];

                    if (tag != null) {
                        try {
                            const value = getValue(t, tag);

                            if (value == null) {
                                errors.push(`Unknown tag ${
                                    tag.enum === true ? tag.index : tag.enum
                                } of ${(t as XTag)._attributes.value}`);
                            }

                            if (tag.array) {
                                if (result[tag.index] == null) {
                                    (result as any)[tag.index] = [];
                                }

                                (result as any)[tag.index].push(value);
                            } else {
                                (result as any)[tag.index] = value;
                            }
                        } catch (e) {
                            errors.push(e.message);
                        }

                        continue;
                    }

                    const raceBucket = raceBuckets[id];

                    if (raceBucket != null) {
                        result.raceBucket = raceBucket;
                        continue;
                    }

                    const relatedEntity = relatedEntities[id];

                    if (relatedEntity != null) {
                        result.relatedEntities.push({
                            relation: relatedEntity,
                            cardId:   (t as XTag)._attributes.value,
                        });

                        continue;
                    }

                    const mechanic = mechanics[id];

                    const { type } = t._attributes;

                    if (type !== 'Int' && type !== 'Card') {
                        errors.push(`Incorrect type ${type} of mechanic ${mechanic}`);
                    }

                    const value = Number.parseInt((t as XTag)._attributes.value, 10);

                    if (mechanic != null) {
                        switch (mechanic) {
                        case 'premium':
                            if (value === 1) {
                                result.mechanics.push('premium');
                            } else {
                                result.mechanics.push(`premium:${value}`);
                            }
                            break;
                        case 'jade_golem':
                            result.referencedTags.push('jade_golem');
                            break;
                        case 'quest':
                            if (quest.type == null) {
                                quest.type = 'normal';
                            }

                            break;
                        case 'sidequest':
                            quest.type = 'side';
                            break;
                        case 'quest_progress':
                            quest.progress = value;
                            break;
                        case 'questline':
                            quest.type = 'questline';
                            break;
                        case 'questline_part':
                            quest.part = value;
                            break;
                        case 'puzzle_type':
                            result.mechanics[result.mechanics.indexOf('puzzle')!] = `puzzle:${puzzleTypes[value]}`;
                            break;
                        case 'drag_minion':
                            if (value === 1) {
                                result.mechanics.push('drag_minion_to_buy');
                            } else if (value === 2) {
                                result.mechanics.push('drag_minion_to_sell');
                            } else {
                                errors.push(`Mechanic ${mechanic} with non-1 value`);
                            }
                            break;
                        case 'data_num_1':
                        case 'data_num_2':
                        case 'data_env_1':
                        case 'score_value_1':
                        case 'score_value_2':
                        case 'windfury':
                        case 'buff_attack_up':
                        case 'buff_cost_down':
                        case 'buff_cost_up':
                        case 'buff_health_up':
                        case 'buff_durability_up':
                        case 'discard_cards':
                        case 'game_button':
                        case 'overload':
                        case 'spell_power':
                        case 'darkmoon_prize':
                        case 'lettuce_role':
                        case '?1672':
                        case '?lettuce_ability_summoned_minion':
                        case 'lettuce_current_cooldown':
                        case 'overload_owed':
                        case 'the_rat_king_skill_activating_type':
                        case 'entity_threshold_value':
                        case 'transfromed_card_visual_type':
                        case 'quest_param_no_beast':
                        case 'quest_param_no_demon':
                        case 'quest_param_no_dragon':
                        case 'quest_param_no_mech':
                        case 'quest_param_no_murloc':
                        case 'quest_param_no_pirate':
                        case 'quest_param_no_elemental':
                        case 'quest_param_no_quilboar':
                        case 'quest_param_no_naga':
                        case 'quest_lower_bound':
                        case 'quest_upper_bound':
                        case 'quest_adjustment':
                        case 'quest_reward_adjustment':
                        case 'quest_reward_rarity':
                        case 'quest_reward_race':
                            result.mechanics.push(`${mechanic}:${value}`);
                            break;
                        case 'base_galakrond':
                        case 'hide_stats':
                        case 'hide_watermark':
                        case 'poison':
                        case 'dormant_visual':
                        case 'advance_fight':
                        case '?darkmoon_prize':
                        case '?duels_passive':
                        case '?1684':
                        case 'entity_threshold':
                        case 'one_turn_taunt':
                        case '?sire_denathrius':
                            result.mechanics.push(mechanic);
                            break;
                        default:
                            if (value === 1 || mechanic.startsWith('?')) {
                                result.mechanics.push(mechanic);
                            } else {
                                errors.push(`Mechanic ${mechanic} with non-1 value`);
                            }
                        }

                        continue;
                    } else if (mechanic === null) {
                        // explicitly ignored
                        continue;
                    }

                    errors.push(`Unknown tag ${id}`);
                }

                const m = result.mechanics;

                if (quest.type != null) {
                    result.quest = quest as IEntity['quest'];
                }

                if (
                    m.includes('cant_be_targeted_by_spells')
                    && m.includes('cant_be_targeted_by_hero_powers')
                ) {
                    m[m.indexOf('cant_be_targeted_by_spells')] = 'elusive';
                    m.splice(m.indexOf('cant_be_targeted_by_hero_powers'), 1);
                }

                break;
            }
            case 'Power': {
                result.powers = [];

                for (const p of castArray(entity[k])) {
                    const power: Partial<Power> = {};

                    power.definition = p._attributes.definition;

                    if (p.PlayRequirement != null) {
                        power.playRequirements = [];

                        for (const r of castArray(p.PlayRequirement)) {
                            const type = playRequirements[r._attributes.reqID];

                            const { param } = r._attributes;

                            if (type == null) {
                                errors.push(
                                    `Unknown play requirements ${r._attributes.reqID}`,
                                );
                            }

                            const req: Partial<PlayRequirement> = { type };

                            if (param !== '') {
                                req.param = Number.parseInt(param, 10);
                            }

                            power.playRequirements.push(req as PlayRequirement);
                        }
                    }

                    result.powers.push(power as Power);
                }

                break;
            }
            case 'ReferencedTag': {
                result.referencedTags = [];

                for (const r of castArray(entity[k])) {
                    const id = r._attributes.enumID;

                    const req = mechanics[id];

                    if (req === undefined) {
                        errors.push(`Unknown referenced tag ${id} <${r._attributes.name}>`);
                    } else if (req === null) {
                        continue;
                    }

                    const { value } = r._attributes;

                    if (value !== '1') {
                        switch (req) {
                        case 'windfury':
                            if (value === '3') {
                                result.referencedTags.push('mega_windfury');
                                break;
                            }
                            // fallthrough
                        default:
                            errors.push(
                                `Referenced tag ${id} with non-1 value <${r._attributes.name}>`,
                            );
                        }
                    } else {
                        result.referencedTags.push(req);
                    }
                }

                break;
            }
            case 'EntourageCard': {
                result.entourages = castArray(entity[k]).map(
                    v => v._attributes.cardID,
                );

                break;
            }
            case 'MasterPower': {
                for (const m of castArray(entity[k])) {
                    masters.push(m._text);
                }
                break;
            }
            case 'TriggeredPowerHistoryInfo': {
                for (const t of castArray(entity[k])) {
                    const index = Number.parseInt(t._attributes.effectIndex, 10);
                    const inHistory = t._attributes.showInHistory;

                    const p = result.powers?.[index];

                    if (p != null) {
                        p.showInHistory = inHistory === 'True';
                    }
                }
                break;
            }

            default:
                errors.push(`Unknown key ${k}`);
            }
        }

        if (errors.length > 0) {
            throw errors;
        }

        if (result.powers != null && masters.length > 0) {
            for (const m of masters) {
                for (const p of result.powers) {
                    if (p.definition === m) {
                        p.isMaster = true;
                    }
                }
            }
        }

        result.localization = localization as IEntity['localization'];

        for (const l of result.localization) {
            if (l.rawText == null) {
                l.rawText = '';
            }

            l.displayText = l.rawText;
            l.text = l.rawText
                .replace(/[$#](\d+)/g, (_, m) => m)
                .replace(/<\/?.>|\[.\]/g, '');
        }

        // fix 0 issue
        if (result.cost == null) {
            result.cost = 0;
        }

        if (result.cardType === 'minion') {
            if (result.attack != null && result.health == null) {
                result.health = 0;
            }

            if (result.attack == null && result.health != null) {
                result.attack = 0;
            }
        } else if (result.cardType === 'weapon') {
            if (result.attack != null && result.durability == null) {
                result.durability = 0;
            }

            if (result.attack == null && result.durability != null) {
                result.attack = 0;
            }
        }

        return result as IEntity;
    }

    stopImpl(): void { /* no-op */ }
}
