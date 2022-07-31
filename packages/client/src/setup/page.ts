import { computed } from 'vue';

import { Value, TitleType, useCore } from 'store/core';

import { ParamOption, ParamResult } from 'store/core/params';
import { Action } from 'store/core/action';

export interface Option {
    title?: Value<string>;
    titleType?: TitleType;
    appendParam?: boolean;
    params?: Record<string, ParamOption>;
    actions?: Action[];
}

export default function pageSetup<O extends Option>(option: O): ParamResult<O['params']> {
    const core = useCore();

    core.titleType = option.titleType ?? 'text';
    core.setTitle(option.title);
    core.initParams(option.params ?? {}, option.appendParam);
    core.actions = option.actions ?? [];

    const params: any = {};

    for (const k of Object.keys(option.params ?? { })) {
        if (option.params![k].readonly) {
            params[k] = computed(() => core.params[k]);
        } else {
            params[k] = computed({
                get() { return core.params[k]; },
                set(newValue: any) {
                    core.params = {
                        ...core.params,
                        [k]: newValue,
                    };
                },
            });
        }
    }

    return params as ParamResult<O['params']>;
}
