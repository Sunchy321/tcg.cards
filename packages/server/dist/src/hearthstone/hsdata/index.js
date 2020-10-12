"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nodegit_1 = require("nodegit");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const xml_js_1 = require("xml-js");
const lodash_1 = require("lodash");
const _config_1 = require("@config");
const logger = __importStar(require("logger"));
const patch_1 = __importDefault(require("db/hearthstone/patch"));
const entity_1 = __importDefault(require("db/hearthstone/entity"));
const hsdata_map_1 = require("@data/hearthstone/hsdata-map");
const remoteUrl = 'https://github.com/HearthSim/hsdata';
const localPath = path.join(_config_1.data, 'hearthstone', 'hsdata');
function hasData() {
    return fs.existsSync(path.join(localPath, '.git'));
}
exports.hasData = hasData;
async function getData() {
    if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
    }
    if (!fs.existsSync(path.join(localPath, '.git'))) {
        await nodegit_1.Clone.clone(remoteUrl, localPath);
        logger.data.info('Hsdata has been cloned', { category: 'hsdata' });
    }
    else {
        const repo = await nodegit_1.Repository.open(localPath);
        await repo.fetchAll();
        await repo.mergeBranches('master', 'origin/master');
        logger.data.info('Hsdata has been pulled', { category: 'hsdata' });
    }
}
exports.getData = getData;
const messagePrefix = 'Update to patch';
async function loadData() {
    const repo = await nodegit_1.Repository.open(localPath);
    const walker = nodegit_1.Revwalk.create(repo);
    walker.pushHead();
    const commits = await walker.getCommitsUntil((c) => c.message().startsWith(messagePrefix));
    for (let c of commits.slice(0, -1)) {
        const version = c.message().slice(messagePrefix.length).trim();
        const sha = c.sha();
        const patch = await patch_1.default.findOne({ version });
        if (patch == null) {
            const newPatch = new patch_1.default({
                version,
                sha,
            });
            await newPatch.save();
        }
    }
}
exports.loadData = loadData;
let patchStatus = {};
async function loadPatch(version) {
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
        const patch = await patch_1.default.findOne({ version });
        if (patch == null) {
            return;
        }
        await entity_1.default.deleteMany({ version });
        const repo = await nodegit_1.Repository.open(localPath);
        const commit = await repo.getCommit(patch.sha);
        await nodegit_1.Reset.reset(repo, commit, 3 /* HARD */, {});
        const xml = fs
            .readFileSync(path.join(localPath, 'CardDefs.xml'))
            .toString();
        const cardDefs = xml_js_1.xml2js(xml, {
            compact: true,
            ignoreDeclaration: true,
            ignoreComment: true,
        });
        let failure = [];
        const entities = cardDefs.CardDefs.Entity.map(e => {
            try {
                return convertEntity(e, version);
            }
            catch (e) {
                failure.push(e.message);
                return {};
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
        await entity_1.default.insertMany(entities);
        patch.isUpdated = true;
        await patch.save();
        patchStatus = {};
        logger.data.info(`Patch ${version} has been loaded`, {
            category: 'hsdata',
        });
    }
    catch (e) {
        patchStatus = {};
        throw e;
    }
}
exports.loadPatch = loadPatch;
function getValue(tag, info) {
    if (tag._attributes.type === 'LocString') {
        return Object.entries(tag)
            .filter(v => v[0] !== '_attributes')
            .map(v => ({
            lang: v[0],
            value: v[1]._text,
        }));
    }
    else {
        if (info.bool) {
            const value = tag._attributes.value;
            if (value !== '') {
                throw new Error(`Tag ${info.index} with non-1 value`);
            }
            else {
                return true;
            }
        }
        else if (info.enum) {
            const enumId = info.enum === true ? info.index : info.enum;
            const id = tag._attributes.value;
            switch (enumId) {
                case 'set':
                    return hsdata_map_1.sets[id];
                case 'class':
                    return hsdata_map_1.classes[id];
                case 'multiClass':
                    return hsdata_map_1.multiClasses[id];
                case 'type':
                    return hsdata_map_1.types[id];
                case 'race':
                    return hsdata_map_1.races[id];
                case 'raceBucket':
                    return hsdata_map_1.raceBuckets[id];
                case 'mechanic':
                    return hsdata_map_1.mechanics[id];
                case 'puzzleType':
                    return hsdata_map_1.puzzleTypes[id];
                case 'referencedTag':
                    return hsdata_map_1.referencedTags[id];
                case 'playRequirement':
                    return hsdata_map_1.playRequirements[id];
                case 'rarity':
                    return hsdata_map_1.rarities[id];
                case 'faction':
                    return hsdata_map_1.factions[id];
                default:
                    throw new Error(`Unknown enum ${enumId}`);
            }
        }
        else {
            switch (tag._attributes.type) {
                case 'Int':
                    return parseInt(tag._attributes.value);
                case 'String':
                    return tag._text;
                case 'Card':
                    // use hsdata attribute here
                    return tag._attributes.cardID;
                default:
                    throw new Error(`New object type ${tag._attributes.type}`);
            }
        }
    }
}
function convertEntity(e, version) {
    const entity = { version };
    const cardId = e._attributes.CardID;
    entity.classes = [];
    entity.mechanics = [];
    try {
        const keys = Object.keys(e);
        if (keys.some(k => ![
            '_attributes',
            'Tag',
            'Power',
            'ReferencedTag',
            'EntourageCard',
            'MasterPower',
            'TriggeredPowerHistoryInfo',
        ].includes(k))) {
            throw new Error(`Unknown key in ${cardId}`);
        }
        const attr = e._attributes;
        entity.cardId = attr.CardID;
        entity.dbfId = parseInt(attr.ID);
        const tagElems = e.Tag;
        if (tagElems != null) {
            for (let t of lodash_1.castArray(tagElems)) {
                const id = t._attributes.enumID;
                const tag = hsdata_map_1.tags[id];
                if (tag != null) {
                    const value = getValue(t, tag);
                    if (tag.array) {
                        if (entity[tag.index] == null) {
                            entity[tag.index] = [];
                        }
                        entity[tag.index].push(value);
                    }
                    else {
                        entity[tag.index] = value;
                    }
                    continue;
                }
                const raceBucket = hsdata_map_1.raceBuckets[id];
                if (raceBucket != null) {
                    entity.raceBucket = raceBucket;
                    continue;
                }
                try {
                    const mechanic = hsdata_map_1.mechanics[id];
                    const type = t._attributes.type;
                    if (type !== 'Int' && type !== 'Card') {
                        throw new Error(`Incorrect type ${type} of mechanic ${mechanic}`);
                    }
                    const value = parseInt(t._attributes.value);
                    if (mechanic != null) {
                        switch (mechanic) {
                            case 'drag_minion':
                                if (value === 1) {
                                    entity.mechanics.push('drag_minion_to_buy');
                                }
                                else if (value === 2) {
                                    entity.mechanics.push('drag_minion_to_sell');
                                }
                                else {
                                    throw new Error(`Mechanic ${mechanic} with non-1 value`);
                                }
                                break;
                            case 'jade_golem':
                                if (entity.referencedTags == null) {
                                    entity.referencedTags = [];
                                }
                                entity.referencedTags.push('jade_golem');
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
                                if (value === 1) {
                                    entity.mechanics.push(mechanic);
                                }
                                else if (value === 3) {
                                    entity.mechanics.push('mega_windfury');
                                }
                                else {
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
                                }
                                else {
                                    throw new Error(`Mechanic ${mechanic} with non-1 value`);
                                }
                        }
                    }
                }
                catch (e) {
                    e.message += ` <${t._attributes.name}>`;
                    throw e;
                }
            }
        }
        const powers = e.Power;
        if (powers != null) {
            entity.powers = [];
            for (let p of lodash_1.castArray(powers)) {
                const power = {};
                power.definition = p._attributes.definition;
                if (p.PlayRequirement != null) {
                    power.playRequirements = [];
                    for (let r of lodash_1.castArray(p.PlayRequirement)) {
                        const type = hsdata_map_1.playRequirements[r._attributes.enumID];
                        const param = r._attributes.param;
                        if (type == null) {
                            throw new Error(`Unknown play requirements ${r._attributes.reqID} in ${cardId}`);
                        }
                        const req = { type };
                        if (param !== '') {
                            req.param = parseInt(param);
                        }
                        power.playRequirements.push(req);
                    }
                }
                entity.powers.push(power);
            }
        }
        const rtagElems = e.ReferencedCard;
        if (rtagElems != null) {
            if (entity.referencedTags == null) {
                entity.referencedTags = [];
            }
            for (let r of lodash_1.castArray(rtagElems)) {
                const id = r._attributes.enumID;
                try {
                    const req = hsdata_map_1.referencedTags[id];
                    const value = r._attributes.value;
                    if (value !== '1') {
                        switch (req) {
                            case 'windfury':
                                if (value === '3') {
                                    entity.referencedTags.push('mega_windfury');
                                    break;
                                }
                            default:
                                throw new Error(`Referenced tag ${id} with non-1 value`);
                        }
                    }
                    else {
                        entity.referencedTags.push(req);
                    }
                }
                catch (e) {
                    e.message += ` <${r._attributes.name}>`;
                    throw e;
                }
            }
        }
        const entourageCard = e.EntourageCard;
        if (entourageCard != null) {
            entity.entourages = lodash_1.castArray(entourageCard).map(v => v._attributes.CardID);
        }
        // Replace can't be targeted by spell and hero power with 'elusive'
        if (entity.mechanics != null) {
            const m = entity.mechanics;
            if (m.includes('cant_be_targeted_by_spells') &&
                m.includes('cant_be_targeted_by_hero_powers')) {
                m[m.indexOf('cant_be_targeted_by_spells')] = 'elusive';
                m.splice(m.indexOf('cant_be_targeted_by_hero_powers'), 1);
            }
        }
        ++patchStatus.count;
    }
    catch (e) {
        e.message += ` [${cardId}]`;
        throw e;
    }
    return entity;
}
//# sourceMappingURL=index.js.map