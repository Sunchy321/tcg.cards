import { Model, Schema } from 'mongoose';

import conn from './db';

import { Entity as IEntity } from '@interface/hearthstone/entity';

import { ITag } from '@/hearthstone/hsdata';

import { omitBy } from 'lodash';

import internalData from '@/internal-data';

type Methods = {
    intoTags(): Record<number, number>;
};

// eslint-disable-next-line @typescript-eslint/ban-types
const EntitySchema = new Schema<IEntity, Model<IEntity>, Methods, {}, {}, {}, '$type'>({
    version: [Number],

    entityId: String,
    cardId:   String,
    dbfId:    Number,
    slug:     String,

    localization: [{
        _id:             false,
        lang:            String,
        name:            String,
        text:            String,
        displayText:     String,
        rawText:         String,
        targetText:      String,
        textInPlay:      String,
        howToEarn:       String,
        howToEarnGolden: String,
        flavor:          String,
        illusId:         String,
    }],

    set:         String,
    classes:     [String],
    type:        String,
    cost:        Number,
    attack:      Number,
    health:      Number,
    durability:  Number,
    armor:       Number,
    rune:        { $type: [String], default: undefined },
    race:        { $type: [String], default: undefined },
    spellSchool: String,
    quest:       { type: String, progress: Number, part: Number },

    techLevel:    Number,
    inBobsTavern: { $type: Boolean, default: false },
    tripleCard:   String,
    raceBucket:   String,
    coin:         Number,
    armorBucket:  Number,
    buddy:        String,
    bannedRace:   String,

    mercenaryRole:    String,
    mercenaryFaction: String,
    colddown:         Number,

    collectible: { $type: Boolean, default: false },
    elite:       { $type: Boolean, default: false },
    rarity:      String,

    artist: String,

    faction: String,

    mechanics:      [String],
    referencedTags: [String],

    powers: {
        $type: [{
            _id:              false,
            definition:       String,
            isMaster:         Boolean,
            showInHistory:    Boolean,
            playRequirements: {
                $type: [
                    {
                        _id:     false,
                        reqType: String,
                        param:   Number,
                    },
                ],
                default: undefined,
            },
        }],
        default: undefined,
    },

    relatedEntities: [{
        _id:      false,
        relation: String,
        entityId: String,
    }],

    entourages:      { $type: [String], default: undefined },
    heroPower:       String,
    heroicHeroPower: String,

    multipleClasses:   Number,
    deckOrder:         Number,
    overrideWatermark: String,
    deckSize:          Number,
    localizationNotes: String,

    isCurrent: Boolean,
}, {
    typeKey: '$type',
    toJSON:  {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;

            return ret;
        },
    },
    methods: {
        intoTags() {
            const tags: Record<number, number> = {};

            const field = internalData<Record<number, ITag>>('hearthstone.tag.field');
            const type = internalData<Record<number, string>>('hearthstone.tag.map.type');
            const spellSchool = internalData<Record<number, string>>('hearthstone.tag.map.spell-school');
            const rune = internalData<Record<number, string>>('hearthstone.tag.map.rune');
            const set = internalData<Record<number, string>>('hearthstone.tag.map.set');
            const rarity = internalData<Record<number, string>>('hearthstone.tag.map.rarity');
            const mechanic = internalData<Record<number, string>>('hearthstone.tag.map.mechanic');

            const fieldKey = (key: keyof IEntity) => Number.parseInt(Object.entries(field).find(v => v[1].index === key)![0], 10);

            const invertFind = (map: Record<number, string>, value: string) => Number.parseInt(Object.entries(map).find(v => v[1] === value)![0], 10);

            tags[fieldKey('type')] = invertFind(type, this.type);
            tags[fieldKey('cost')] = this.cost ?? 0;
            tags[fieldKey('attack')] = this.attack ?? 0;
            tags[fieldKey('health')] = this.health ?? 0;
            tags[fieldKey('durability')] = this.durability ?? 0;
            tags[fieldKey('armor')] = this.armor ?? 0;

            if (this.spellSchool != null) {
                tags[fieldKey('spellSchool')] = invertFind(spellSchool, this.spellSchool);
            }

            tags[fieldKey('set')] = invertFind(set, this.set);

            if (this.rarity != null) {
                tags[fieldKey('rarity')] = invertFind(rarity, this.rarity!);
            }

            tags[fieldKey('elite')] = this.elite ? 1 : 0;
            tags[fieldKey('techLevel')] = this.techLevel ?? 0;

            tags[invertFind(rune, 'blood')] = this.rune?.includes('blood') ? 1 : 0;
            tags[invertFind(rune, 'frost')] = this.rune?.includes('frost') ? 1 : 0;
            tags[invertFind(rune, 'unholy')] = this.rune?.includes('unholy') ? 1 : 0;
            tags[invertFind(mechanic, 'tradable')] = this.mechanics.includes('tradable') ? 1 : 0;
            tags[invertFind(mechanic, 'forge')] = this.mechanics.includes('forge') ? 1 : 0;
            tags[invertFind(mechanic, 'hide_cost')] = this.mechanics.includes('hide_cost') ? 1 : 0;
            tags[invertFind(mechanic, 'hide_attack')] = this.mechanics.includes('hide_attack') ? 1 : 0;
            tags[invertFind(mechanic, 'hide_health')] = this.mechanics.includes('hide_health') ? 1 : 0;
            tags[invertFind(mechanic, 'in_mini_set')] = this.mechanics.includes('in_mini_set') ? 1 : 0;
            tags[invertFind(mechanic, 'hide_watermark')] = this.mechanics.includes('hide_watermark') ? 1 : 0;

            return tags;
        },
    },
});

const Entity = conn.model('entity', EntitySchema);

export default Entity;
