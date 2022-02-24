/* eslint-disable camelcase, @typescript-eslint/no-use-before-define */
import { RawItem } from '../parser';
import {
    CommonItem,
    EntityAvatar,
    parseEntity,
    transformCommon,
    underScoreToCamelCase,
    withMethod,
} from './common';

export type GameState_OnEntityChoice = {
    method: 'GameState';
    type: 'OnEntityChoice';
};

export type GameState_PowerList = {
    method: 'GameState';
    type: 'PowerList';
    count: string;
};

export type GameState_PrintGame = {
    method: 'GameState';
    type: 'PrintGame';
    tags: {
        tag: string;
        value: string;
    }[];
};

export type GameState_Options = {
    method: 'GameState';
    type: 'Options';
    id: number;
    options: {
        type: string;
        mainEntity?: EntityAvatar;
        error: string;
        errorParam?: number;
        targets?: {
            entity: EntityAvatar;
            error: string;
            errorParam?: number;
        }[];
    }[];
};

export type GameState_SendOption = {
    method: 'GameState';
    type: 'SendOption';
    selectedOption: number;
    selectedSubOption: number;
    selectedTarget: number;
    selectedPosition: number;
};

export type GameState_Power = CommonItem & { method: 'GameState' };

export type GameStateItem =
    GameState_OnEntityChoice | GameState_Options | GameState_Power |
    GameState_PowerList | GameState_PrintGame | GameState_SendOption;

export function transformGameStatePowerList(item: RawItem): GameState_PowerList | null {
    const m = /^Count=(\d+)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, count] = m;

    return {
        method: 'GameState',
        type:   'PowerList',
        count,
    };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function transformGameStateOnEntityChoice(item: RawItem): GameState_OnEntityChoice {
    return {
        method: 'GameState',
        type:   'OnEntityChoice',
    };
}

export function transformGameStateOptions(item: RawItem): GameState_Options | null {
    const m = /^id=(\d+)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, idText] = m;

    const id = Number.parseInt(idText, 10);

    const options = [];

    for (const rawOption of item.children ?? []) {
        const mo = /^option \d+ type=(.*) mainEntity=(.*) error=(.*) errorParam=(.*)$/.exec(rawOption.text);

        if (mo == null) { return null; }

        const [__, typeText, mainEntityText, errorText, errorParamText] = mo;

        const type = underScoreToCamelCase(typeText);
        const mainEntity = parseEntity(mainEntityText);
        const error = underScoreToCamelCase(errorText);
        const errorParam = Number.parseInt(errorParamText, 10);

        if (mainEntityText !== '' && mainEntity == null) { return null; }

        const targets = [];

        for (const rawTarget of rawOption.children ?? []) {
            const mt = /^target \d+ entity=(.*) error=(.*) errorParam=(.*)$/.exec(rawTarget.text);

            if (mt == null) { return null; }

            const [___, entityText, targetErrorText, targetErrorParamText] = mt;

            const entity = parseEntity(entityText);
            const targetError = underScoreToCamelCase(targetErrorText);
            const targetErrorParam = Number.parseInt(targetErrorParamText, 10);

            if (entity == null) { return null; }

            const target = {
                entity,
                error:      targetError,
                errorParam: targetErrorParam,
            } as NonNullable<GameState_Options['options'][0]['targets']>[0];

            if (errorParamText === '') {
                delete target.errorParam;
            }

            targets.push(target);
        }

        const option = {
            type,
            mainEntity,
            error,
            errorParam,
            targets,
        } as GameState_Options['options'][0];

        if (mainEntityText === '') {
            delete option.mainEntity;
        }

        if (errorParamText === '') {
            delete option.errorParam;
        }

        if (targets.length === 0) {
            delete option.targets;
        }

        options.push(option);
    }

    return {
        method: 'GameState',
        type:   'Options',
        id,
        options,
    };
}

export function transformGameStatePrintGame(item: RawItem): GameState_PrintGame | null {
    if (item.text.startsWith('Player')) {
        const m = /^PlayerID=(\d+), PlayerName=(.*)$/.exec(item.text);

        if (m == null) { return null; }

        const [_, id, name] = m;

        return {
            method: 'GameState',
            type:   'PrintGame',
            tags:   [
                { tag: 'playerId', value: id },
                { tag: 'playerName', value: name },
            ],
        };
    } else {
        const m = /^([^=]+)=([^ ]+)$/.exec(item.text);

        if (m == null) { return null; }

        const [_, tagText, value] = m;

        const tag = tagText[0].toLowerCase() + tagText.slice(1);

        return {
            method: 'GameState',
            type:   'PrintGame',
            tags:   [{ tag, value }],
        };
    }
}

export function transformGameStateSendOption(item: RawItem): GameState_SendOption | null {
    const m = /^selectedOption=(-?\d+) selectedSubOption=(-?\d+) selectedTarget=(-?\d+) selectedPosition=(-?\d+)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, selectedOptionText, selectedSubOptionText, selectedTargetText, selectedPositionText] = m;

    const selectedOption = Number.parseInt(selectedOptionText, 10);
    const selectedSubOption = Number.parseInt(selectedSubOptionText, 10);
    const selectedTarget = Number.parseInt(selectedTargetText, 10);
    const selectedPosition = Number.parseInt(selectedPositionText, 10);

    return {
        method: 'GameState',
        type:   'SendOption',
        selectedOption,
        selectedSubOption,
        selectedTarget,
        selectedPosition,
    };
}

export function transformGameStatePower(item: RawItem): GameState_Power | null {
    const common = transformCommon(item);

    if (common != null) {
        return withMethod(common, 'GameState');
    }

    return null;
}
