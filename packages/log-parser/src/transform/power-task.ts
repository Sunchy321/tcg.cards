/* eslint-disable camelcase */
import { RawItem } from '../parser';

import {
    CommonItem,
    transformCommon,
    withMethod,
} from './common';

export type PowerTask_DumpInfo = {
    method: 'PowerTask';
    type: 'Dump';
    id: string;
    parentId: string;
    previousId: string;
    taskCount: string;
};

export type PowerTask_Start = { method: 'PowerTask', type: 'Start' };

export type PowerTask_End = { method: 'PowerTask', type: 'End' };

export type PowerTask_Dump = PowerTask_DumpInfo | PowerTask_End | PowerTask_Start;

export type PowerTask_Power = CommonItem & { method: 'PowerTask' };

export type PowerProcessor_PrepareHistory = {
    method: 'PowerProcessor';
    type: 'PrepareHistory';
    taskList: number;
};

export type PowerProcessor_DoTaskList = {
    method: 'PowerProcessor';
    type: 'DoTaskList';
};

export type PowerProcessor_EndTaskList = {
    method: 'PowerProcessor';
    type: 'EndTaskList';
    taskList: number;
};

export type PowerTaskItem =
    PowerProcessor_DoTaskList | PowerProcessor_EndTaskList |
    PowerProcessor_PrepareHistory | PowerTask_Dump | PowerTask_Power;

export function transformPowerTaskDump(item: RawItem): PowerTask_Dump | null {
    if (item.text === 'Block Start=(null)') {
        return { method: 'PowerTask', type: 'Start' };
    } else if (item.text === 'Block End=(null)') {
        return { method: 'PowerTask', type: 'End' };
    } else {
        const m = /^ID=(\d+) ParentID=(\d+) PreviousID=(\d+) TaskCount=(\d+)$/.exec(item.text);

        if (m == null) { return null; }

        const [_, id, parentId, previousId, taskCount] = m;

        return {
            method: 'PowerTask',
            type:   'Dump',
            id,
            parentId,
            previousId,
            taskCount,
        };
    }
}

export function transformPowerTaskPower(item: RawItem): PowerTask_Power | null {
    const common = transformCommon(item);

    if (common != null) {
        return withMethod(common, 'PowerTask');
    }

    return null;
}

export function transformPowerProcessorPrepareHistory(item: RawItem):
PowerProcessor_PrepareHistory | null {
    const m = /^m_currentTaskList=(\d+)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, taskListText] = m;

    const taskList = Number.parseInt(taskListText, 10);

    return {
        method: 'PowerProcessor',
        type:   'PrepareHistory',
        taskList,
    };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function transformPowerProcessorDoTask(item: RawItem): PowerProcessor_DoTaskList {
    return {
        method: 'PowerProcessor',
        type:   'DoTaskList',
    };
}

export function transformPowerProcessorEndTaskList(item: RawItem):
PowerProcessor_EndTaskList | null {
    const m = /^m_currentTaskList=(\d+)$/.exec(item.text);

    if (m == null) { return null; }

    const [_, taskListText] = m;

    const taskList = Number.parseInt(taskListText, 10);

    return {
        method: 'PowerProcessor',
        type:   'EndTaskList',
        taskList,
    };
}
