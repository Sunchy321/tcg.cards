import Task from '@/common/task';

import Entity from '@/hearthstone/db/entity';

import fs from 'fs';
import git, { ResetMode } from 'simple-git';

import { join } from 'path';

import { dataPath } from '@/config';
import { localPath as hsdataPath, langMap } from '@/hearthstone/hsdata/base';

interface ILocValue {
    m_locValues: string[];
    m_locId:     number;
}

interface IDbfCard {
    m_ID:                            number;
    m_noteMiniGuid:                  string;
    m_longGuid:                      string;
    m_textInHand:                    ILocValue;
    m_gameplayEvent:                 string;
    m_craftingEvent:                 string;
    m_goldenCraftingEvent:           string;
    m_suggestionWeight:              number;
    m_changeVersion:                 number;
    m_name:                          ILocValue;
    m_flavorText:                    ILocValue;
    m_howToGetCard:                  ILocValue;
    m_howToGetGoldCard:              ILocValue;
    m_howToGetDiamondCard:           ILocValue;
    m_targetArrowText:               ILocValue;
    m_artistName:                    string;
    m_shortName:                     ILocValue;
    m_creditsCardName:               string;
    m_featuredCardsEvent:            string;
    m_battlegroundsActiveEvent:      string;
    m_battlegroundsEarlyAccessEvent: string;
    m_battlegroundsEveryGameEvent:   string;
    m_cardTextBuilderType:           number;
    m_watermarkTextureOverride:      string;
}

interface IDbfCardFile {
    m_GameObject: {
        m_FileID: number;
        m_PathID: number;
    };
    m_Enabled: number;
    m_Script: {
        m_FileID: number;
        m_PathID: number;
    };
    m_Name:  'CARD';
    Records: IDbfCard[];
}

interface IDisplayTextStatus {
    method: 'get';
    type:   'display-text';
    count:  number;
    total:  number;
}

export enum TextBuilderType {
    default,
    jadeGolem,
    jadeGolemTrigger,
    modular,
    kazakusPotion,
    primordialWand,
    alternateCardText,
    scriptDataNum1,
    galakrondCounter,
    decorate,
    playerTagThreshold,
    entityTagThreshold,
    deprecated12,
    gameplayString,
    zombeast,
    zombeastEnchantment,
    hiddenChoice,
    investigate,
    referenceCreatorEntity,
    referenceScriptDataNum1,
    referenceScriptDataNum1Num2,
    undatakahEnchant,
    spellDamageOnly,
    drustvarHorror,
    hiddenEntity,
    scoreValueCountDown,
    scriptDataNum1Num2,
    poweredUpTargetingText,
    multipleAltTextScriptDataNums,
    referenceScriptDataNum1EntityPower,
    referenceScriptDataNum1CardDBID,
}

export const dbfPath = join(dataPath, 'hearthstone', 'dbf');

function getTag(mechanics: string[], id: string): number {
    const tag = mechanics.find(m => m.startsWith(id));

    if (tag == null) {
        return 0;
    } else {
        return Number.parseInt(tag.slice(id.length + 1), 10);
    }
}

function getStringsPrefix(cardID: string): string {
    if (cardID.includes('LOOT_507')) {
        return 'GAMEPLAY_DIAMOND_SPELLSTONE_';
    }
    if (cardID.includes('LOOT_091')) {
        return 'GAMEPLAY_PEARL_SPELLSTONE_';
    }
    if (cardID.includes('LOOT_064')) {
        return 'GAMEPLAY_SAPPHIRE_SPELLSTONE_';
    }
    if (cardID.includes('LOOT_051')) {
        return 'GAMEPLAY_JASPER_SPELLSTONE_';
    }
    if (cardID.includes('LOOT_043')) {
        return 'GAMEPLAY_AMETHYST_SPELLSTONE_';
    }
    if (cardID.includes('LOOT_103')) {
        return 'GAMEPLAY_RUBY_SPELLSTONE_';
    }
    if (cardID.includes('LOOT_503')) {
        return 'GAMEPLAY_ONYX_SPELLSTONE_';
    }
    if (cardID.includes('LOOT_526d')) {
        return 'GAMEPLAY_LOOT_526d_DARKNESS_';
    }
    if (cardID.includes('TOT_109t')) {
        return 'GAMEPLAY_TOT_109t_STASIS_DRAGON_';
    }
    if (cardID.includes('TRLA_1')) {
        return 'GAMEPLAY_TRLA_TROLL_SHRINE_';
    }
    return '';
}

export function getDisplayText(
    text: string,
    type: TextBuilderType,
    id: string,
    mechanics: string[],
    strings: Record<string, string>,
): string {
    switch (type) {
    case TextBuilderType.default:
    case TextBuilderType.modular:
    case TextBuilderType.zombeast:
    case TextBuilderType.zombeastEnchantment:
    case TextBuilderType.investigate:
    case TextBuilderType.referenceCreatorEntity:
    case TextBuilderType.referenceScriptDataNum1:
    case TextBuilderType.referenceScriptDataNum1Num2:
    case TextBuilderType.undatakahEnchant:
    case TextBuilderType.spellDamageOnly:
    case TextBuilderType.drustvarHorror:
    case TextBuilderType.poweredUpTargetingText:
        return text;
    case TextBuilderType.kazakusPotion:
    case TextBuilderType.primordialWand:
    case TextBuilderType.alternateCardText:
    case TextBuilderType.playerTagThreshold:
    case TextBuilderType.entityTagThreshold:
    case TextBuilderType.hiddenEntity:
    case TextBuilderType.referenceScriptDataNum1EntityPower:
        return text.split('@')[0];
    case TextBuilderType.jadeGolem:
    case TextBuilderType.jadeGolemTrigger:
        return text.split('@')[1] ?? text;
    case TextBuilderType.scriptDataNum1: {
        const dataNum1 = getTag(mechanics, 'data_num_1');

        const parts = text.split('@');

        if (parts.length === 3 && dataNum1 === 0) {
            return `${parts[0]}${parts[1]}0${parts[2]}`;
        } else {
            return text.replace(/@/g, dataNum1.toString());
        }
    }
    case TextBuilderType.galakrondCounter: {
        const dataNum1 = getTag(mechanics, 'data_num_1');
        const dataNum2 = getTag(mechanics, 'data_num_2');

        const gameplayText = dataNum2 - dataNum1 === 1
            ? strings.GALAKROND_ONCE
            : strings.GALAKROND_TWICE;

        return text.replace(/@/g, gameplayText);
    }
    case TextBuilderType.decorate: {
        return text.replace(/\{[01]\}/g, '0');
    }
    case TextBuilderType.gameplayString: {
        if (!text.includes('@')) {
            return text;
        }

        const gameplayText = strings[`${getStringsPrefix(id)}1`];

        return text.split('@')[0] + gameplayText;
    }
    case TextBuilderType.hiddenChoice: {
        const hiddenChoice = getTag(mechanics, 'hidden_choice');

        return text.split('@')[hiddenChoice] ?? text;
    }
    case TextBuilderType.scoreValueCountDown: {
        const scoreValue = getTag(mechanics, 'score_value_1');

        return text.replace(/@/g, scoreValue.toString());
    }
    case TextBuilderType.scriptDataNum1Num2: {
        const dataNum1 = getTag(mechanics, 'data_num_1');
        const dataNum2 = getTag(mechanics, 'data_num_2');

        return text
            .replace(/\{0\}/g, dataNum1.toString())
            .replace(/\{1\}/g, dataNum2.toString());
    }
    case TextBuilderType.multipleAltTextScriptDataNums: {
        let subsText = text;

        if (text.includes('{0}')) {
            const dataNum1 = getTag(mechanics, 'data_num_1');

            if (text.includes('{1}')) {
                const dataNum2 = getTag(mechanics, 'data_num_2');

                subsText = text
                    .replace(/\{0\}/g, dataNum1.toString())
                    .replace(/\{1\}/g, dataNum2.toString());
            } else {
                subsText = text
                    .replace(/\{0\}/g, dataNum1.toString());
            }
        }

        const num = getTag(mechanics, 'use_alternate_card_text');

        const alts = subsText.split('@');

        if (num < 0) { return alts[0]; }
        if (num >= alts.length) { return alts[alts.length - 1]; }
        return alts[num];
    }
    default:
        return text;
    }
}

const stringsPath = join(hsdataPath, 'Strings');

export function getLangStrings(): Record<string, Record<string, string>> {
    const strings: Record<string, Record<string, string>> = {};

    const langs = fs.readdirSync(stringsPath)
        .filter(f => fs.statSync(join(stringsPath, f)).isDirectory);

    for (const l of langs) {
        strings[langMap[l] ?? l] = {};

        const fileContent = fs.readFileSync(join(stringsPath, l, 'GAMEPLAY.txt')).toString();

        for (const line of fileContent.split('\n')) {
            const [id, text] = line.split('\t');

            strings[langMap[l] ?? l][id] = text;
        }
    }

    return strings;
}

export function getDbfCardFile(): IDbfCardFile {
    const versions = fs.readdirSync(dbfPath).filter(v => fs.statSync(join(dbfPath, v)).isDirectory());

    const version = versions.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))[0];

    return JSON.parse(fs.readFileSync(join(dbfPath, version, 'CARD.json')).toString()) as IDbfCardFile;
}

export class DisplayTextLoader extends Task<IDisplayTextStatus> {
    async startImpl(): Promise<void> {
        const repo = git({
            baseDir:  hsdataPath,
            progress: p => {
                this.emit('progress', { type: 'git', ...p });
            },
        });

        await repo.reset(ResetMode.HARD, ['HEAD']);

        const strings = getLangStrings();
        const fileJson = getDbfCardFile();

        let count = 0;
        const total = await Entity.estimatedDocumentCount({});

        this.intervalProgress(500, () => ({
            method: 'get',
            type:   'display-text',
            count,
            total,
        }));

        for await (const e of Entity.find()) {
            if (this.status === 'idle') {
                return;
            }

            const json = fileJson.Records.find(r => r.m_ID === e.dbfId);

            for (const l of e.localization) {
                const text = l.rawText.replace(/[$#](\d+)/g, (_, m) => m);

                l.displayText = getDisplayText(
                    text,
                    json?.m_cardTextBuilderType ?? TextBuilderType.default,
                    e.entityId,
                    e.mechanics,
                    strings[l.lang],
                );

                l.text = l.displayText.replace(/<\/?.>|\[.\]/g, '');
            }

            await e.save();

            count += 1;
        }
    }

    stopImpl(): void { /* no-op */ }
}
