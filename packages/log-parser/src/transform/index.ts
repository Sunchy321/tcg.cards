import { RawItem } from '../parser';

import {
    GameStateItem,
    transformGameStateOnEntityChoice,
    transformGameStateOptions,
    transformGameStatePower,
    transformGameStatePowerList,
    transformGameStatePrintGame,
    transformGameStateSendOption,
} from './game-state';

import {
    PowerTaskItem,
    transformPowerProcessorDoTask,
    transformPowerProcessorEndTaskList,
    transformPowerProcessorPrepareHistory,
    transformPowerTaskDump,
    transformPowerTaskPower,
} from './power-task';

import { last } from 'lodash';

export type RawEntity = Record<string, any>;

export type UnknownLogItem = {
    type:      'unknown';
    method:    string;
    text:      string;
    children?: LogItem[];
};

export type LogItem = GameStateItem | PowerTaskItem | UnknownLogItem;

function toUnknown(item: RawItem): UnknownLogItem {
    return item.children != null
        ? {
            type:     'unknown',
            method:   item.method,
            text:     item.text,
            children: transform(item.children),
        }
        : {
            type:   'unknown',
            method: item.method,
            text:   item.text,
        };
}

function transformBase(item: RawItem): LogItem | null {
    switch (item.method) {
    case 'GameState.OnEntityChoices':
        return transformGameStateOnEntityChoice(item);
    case 'GameState.DebugPrintPowerList':
        return transformGameStatePowerList(item);
    case 'GameState.DebugPrintGame':
        return transformGameStatePrintGame(item);
    case 'GameState.DebugPrintPower':
        return transformGameStatePower(item);
    case 'GameState.DebugPrintOptions':
        return transformGameStateOptions(item);
    case 'GameState.SendOption':
        return transformGameStateSendOption(item);
    case 'PowerTaskList.DebugDump':
        return transformPowerTaskDump(item);
    case 'PowerTaskList.DebugPrintPower':
        return transformPowerTaskPower(item);
    case 'PowerProcessor.PrepareHistoryForCurrentTaskList':
        return transformPowerProcessorPrepareHistory(item);
    case 'PowerProcessor.DoTaskListForCard':
        return transformPowerProcessorDoTask(item);
    case 'PowerProcessor.EndCurrentTaskList':
        return transformPowerProcessorEndTaskList(item);
    default:
        return null;
    }
}

export default function transform(items: RawItem[]): LogItem[] {
    const transformedItems = items.map(item => transformBase(item) ?? toUnknown(item));

    const result = [];

    for (const item of transformedItems) {
        if (item.type === 'BlockEnd') {
            const lastItem = last(result);

            if (lastItem != null && !['AttackBlock'].includes(lastItem.type)) {
                result.push(item);
            }
        } else {
            result.push(item);
        }
    }

    return result;
}
