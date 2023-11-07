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

import { dataPath } from '@/config';
import * as logger from '@/logger';

import { toBucket, toGenerator } from '@/common/to-bucket';
import internalData from '@/internal-data';

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

export interface ITag {
    index: keyof IEntity;
    bool?: true;
    array?: true;
    enum?: string | true;
    static?: IEntity[keyof IEntity];
}

export const locTags: Record<string, keyof IEntity['localization'][0]> = {
    184: 'rawText',
    185: 'name',
    252: 'textInPlay',
    325: 'targetText',
    351: 'flavor',
    364: 'howToEarn',
    365: 'howToEarnGolden',
};

export const tags: Record<string, ITag> = {
    45:   { index: 'health' },
    47:   { index: 'attack' },
    48:   { index: 'cost' },
    114:  { index: 'elite', bool: true },
    183:  { index: 'set', enum: 'set' },
    187:  { index: 'durability' },
    199:  { index: 'classes', array: true, enum: 'class' },
    200:  { index: 'race', array: true, enum: true },
    201:  { index: 'faction', enum: true },
    202:  { index: 'cardType', enum: 'type' },
    203:  { index: 'rarity', enum: true },
    292:  { index: 'armor' },
    321:  { index: 'collectible', bool: true },
    344:  { index: 'localizationNotes' },
    342:  { index: 'artist' },
    380:  { index: 'heroPower' },
    476:  { index: 'multipleClasses' },
    480:  { index: 'classes', enum: 'multiClass' },
    997:  { index: 'deckSize' },
    1125: { index: 'deckOrder' },
    1282: { index: 'heroicHeroPower' },
    1429: { index: 'tripleCard' },
    1440: { index: 'techLevel' },
    1456: { index: 'inBobsTavern', bool: true },
    1517: { index: 'overrideWatermark', enum: 'set' },
    1587: { index: 'coin' },
    1635: { index: 'spellSchool', enum: true },
    1666: { index: 'mercenaryRole', enum: true },
    1669: { index: 'colddown' },
    1723: { index: 'armorBucket' },
    2130: { index: 'buddy' },
    2703: { index: 'bannedRace', enum: 'race' },
    2720: { index: 'mercenaryFaction', enum: true },
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

export interface ILoadPatchStatus {
    type: 'load-patch';
    version: number;
    count: number;
    total: number;
}

export class PatchLoader extends Task<ILoadPatchStatus> {
    version: number;

    data: Record<string, any> = { };

    constructor(version: number) {
        super();
        this.version = version;
    }

    private addData(name: string) {
        this.data[name] = internalData(`hearthstone.${name}`);
    }

    private getMapData<T>(name: string): Record<string, T> {
        if (this.data[`hsdata-map.${name}`] == null) {
            this.addData(`hsdata-map.${name}`);
        }

        return this.data[`hsdata-map.${name}`];
    }

    private getSpecialData<T>(name: string): T {
        if (this.data[`hsdata-special.${name}`] == null) {
            this.addData(`hsdata-special.${name}`);
        }

        return this.data[`hsdata-special.${name}`];
    }

    private getValue(tag: XLocStringTag | XTag, info: ITag) {
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

            const filename = (() => {
                switch (enumId) {
                case 'set':
                    return 'set';
                case 'class':
                    return 'class';
                case 'multiClass':
                    return 'multiclass';
                case 'type':
                    return 'type';
                case 'race':
                    return 'race';
                case 'spellSchool':
                    return 'spell-school';
                case 'raceBucket':
                    return 'race-bucket';
                case 'mechanic':
                case 'referencedTag':
                    return 'mechanic';
                case 'puzzleType':
                    return 'puzzle-type';
                case 'playRequirement':
                    return 'play-requirement';
                case 'rarity':
                    return 'rarity';
                case 'faction':
                    return 'faction';
                case 'mercenaryRole':
                    return 'mercenary-role';
                case 'mercenaryFaction':
                    return 'mercenary-faction';
                default:
                    throw new Error(`Unknown enum ${enumId}`);
                }
            })();

            const data = this.getMapData<any>(filename);

            return data[id];
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

                    const { type } = t._attributes;

                    const value = Number.parseInt((t as XTag)._attributes.value, 10);

                    const locTag = locTags[id];

                    if (locTag != null) {
                        for (const k of Object.keys(t as XLocStringTag)) {
                            if (k === '_attributes') {
                                continue;
                            }

                            const lang = langMap[k] ?? k.slice(2);
                            const text = (t as any)[k]._text as string;

                            const loc = localization.find(l => l.lang === lang);

                            if (loc != null) {
                                loc[locTag] = text;
                            } else {
                                localization.push({ lang, [locTag]: text });
                            }
                        }

                        continue;
                    }

                    const tag = tags[id];

                    if (tag != null) {
                        try {
                            const tagValue = this.getValue(t, tag);

                            if (tagValue == null) {
                                errors.push(`Unknown tag ${
                                    tag.enum === true ? tag.index : tag.enum
                                } of ${(t as XTag)._attributes.value}`);
                            }

                            if (tag.array) {
                                if (result[tag.index] == null) {
                                    (result as any)[tag.index] = [];
                                }

                                (result as any)[tag.index].push(tagValue);
                            } else {
                                (result as any)[tag.index] = tagValue;
                            }
                        } catch (e) {
                            errors.push(e.message);
                        }

                        continue;
                    }

                    const rune = this.getMapData<string>('rune')[id];

                    if (rune != null) {
                        if (result.rune == null) {
                            result.rune = [];
                        }

                        for (let i = 0; i < value; i += 1) {
                            result.rune.push(rune);
                        }

                        continue;
                    }

                    const dualRace = this.getMapData<string>('dual-race')[id];

                    if (dualRace != null) {
                        if (result.race == null) {
                            result.race = [];
                        }

                        result.race.push(dualRace);
                        continue;
                    }

                    const raceBucket = this.getMapData<string>('race-bucket')[id];

                    if (raceBucket != null) {
                        result.raceBucket = raceBucket;
                        continue;
                    }

                    const relatedEntity = this.getMapData<string>('related-entity')[id];

                    if (relatedEntity != null) {
                        result.relatedEntities.push({
                            relation: relatedEntity,
                            cardId:   (t as XTag)._attributes.value,
                        });

                        continue;
                    }

                    const mechanic = this.getMapData<string>('mechanic')[id];

                    if (type !== 'Int' && type !== 'Card') {
                        errors.push(`Incorrect type ${type} of mechanic ${mechanic}`);
                    }

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
                            result.mechanics[result.mechanics.indexOf('puzzle')!] = `puzzle:${this.getMapData<string>('puzzle-type')[value]}`;
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
                        default:
                            if (this.getSpecialData<string[]>('mechanic-with-value').includes(mechanic)) {
                                result.mechanics.push(`${mechanic}:${value}`);
                            } else if (this.getSpecialData<string[]>('mechanic-ignore-value').includes(mechanic)) {
                                result.mechanics.push(mechanic);
                            } else if (value === 1 || mechanic.startsWith('?')) {
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
                            const type = this.getMapData<string>('play-requirement')[r._attributes.reqID];

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

                    const req = this.getMapData<string>('mechanic')[id];

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
