import { Ref, ref } from 'vue';

import { useCore } from './index';

export type FilePopup = {
    type:    'file';
    url:     string;
    accept?: string;
};

export interface Action {
    action:   string;
    icon?:    string;
    popup?:   FilePopup;
    enabled?: () => boolean;
    handler:  Record<string, (() => void) | ((payload: any) => void)> | (() => void) | ((payload: any) => void);
}

export interface ActionInfo {
    name:      string;
    type?:     string;
    fallback?: boolean;
    payload?:  any;
}

export function setupAction(): {
    actions:      Ref<Action[]>;
    invokeAction: (actionInfo: ActionInfo) => void;
} {
    const actions = ref<Action[]>([]);

    const invokeAction = (actionInfo: ActionInfo) => {
        const {
            name, type = 'default', fallback = true, payload,
        } = actionInfo;

        for (const a of actions.value) {
            if (a.action === name) {
                const { handler } = a;

                if (typeof handler === 'function') {
                    if (type === 'default' || fallback) {
                        handler(payload);
                    }
                } else if (handler[type] != null) {
                    handler[type](payload);
                } else if (fallback && handler.default != null) {
                    handler['default' as string](payload);
                }
            }
        }
    };

    return { actions, invokeAction };
}

export function useAction(actions: Action[]) {
    const core = useCore();

    core.actions = actions;
}
