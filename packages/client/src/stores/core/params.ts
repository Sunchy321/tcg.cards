import { ComputedRef, MaybeRefOrGetter, computed, WritableComputedRef, Ref, toRef } from 'vue';

import { useRouteParams, useRouteQuery } from '@vueuse/router';

import { useCore } from './index';

type ParamBase = {
    readonly?: boolean;
    bind:      'params' | 'query' | 'state';
    name?:     string;
    inTitle?:  boolean;
    label?:    (id: string) => string;
};

type ParamOptionBoolean = { type: 'boolean', default?: MaybeRefOrGetter<boolean>, icon?: [string, string] };
type ParamOptionString = { type: 'string', default?: MaybeRefOrGetter<string> };
type ParamOptionNumber = { type: 'number', default?: MaybeRefOrGetter<number> };
type ParamOptionEnum = { type: 'enum', values: MaybeRefOrGetter<string[]>, default?: MaybeRefOrGetter<string> };
type ParamOptionDate = { type: 'date', default?: MaybeRefOrGetter<string> };

export type ParamOption = ParamBase & (
    ParamOptionBoolean | ParamOptionDate | ParamOptionEnum | ParamOptionNumber | ParamOptionString
);

type ReactiveParamOptionBoolean = { type: 'boolean', default?: Ref<boolean>, icon?: [string, string] };
type ReactiveParamOptionString = { type: 'string', default?: Ref<string> };
type ReactiveParamOptionNumber = { type: 'number', default?: Ref<number> };
type ReactiveParamOptionEnum = { type: 'enum', values: Ref<string[]>, default?: Ref<string> };
type ReactiveParamOptionDate = { type: 'date', default?: Ref<string> };

export type ReactiveParamOption = ParamBase & (
    ReactiveParamOptionBoolean | ReactiveParamOptionDate | ReactiveParamOptionEnum |
    ReactiveParamOptionNumber | ReactiveParamOptionString
);

type ParamTypeMap = {
    boolean: boolean;
    string:  string;
    number:  number;
    date:    string;
    enum:    string;
};

export type ParamType<T> = T extends ParamOption
    ? T extends ParamOptionEnum
        ? (T['values'] extends [...any] ? T['values'][number] : string)
        : ParamTypeMap[T['type']]
    : never;

export type ParamRefType<T> = T extends ParamOption
    ? T['readonly'] extends true
        ? ComputedRef<ParamType<T>>
        : WritableComputedRef<ParamType<T>>
    : never;

export type Parameter = {
    option: ReactiveParamOption;
    value?: any;
    ref?:   Ref<string | string[] | undefined>;
};

function toReactiveOption(option: ParamOption): ReactiveParamOption {
    const base = { ...option };

    // Convert values and default properties to refs based on the type
    switch (option.type) {
    case 'boolean':
        return {
            ...base,
            default: option.default !== undefined ? toRef(option.default) : undefined,
        } as ReactiveParamOption;
    case 'string':
        return {
            ...base,
            default: option.default !== undefined ? toRef(option.default) : undefined,
        } as ReactiveParamOption;
    case 'number':
        return {
            ...base,
            default: option.default !== undefined ? toRef(option.default) : undefined,
        } as ReactiveParamOption;
    case 'enum':
        return {
            ...base,
            values:  toRef(option.values),
            default: option.default !== undefined ? toRef(option.default) : undefined,
        } as ReactiveParamOption;
    case 'date':
        return {
            ...base,
            default: option.default !== undefined ? toRef(option.default) : undefined,
        } as ReactiveParamOption;
    default:
        return base as ReactiveParamOption;
    }
}

function getDefault(option: ReactiveParamOption): any {
    switch (option.type) {
    case 'boolean':
        return option.default?.value ?? false;
    case 'string':
        return option.default?.value ?? '';
    case 'enum':
        return option.default?.value ?? option.values.value[0];
    case 'number':
        return option.default?.value ?? 0;
    case 'date':
        return option.default?.value ?? new Date().toISOString().split('T')[0];
    default:
        return null;
    }
}

function useRouterRef(bind: ParamOption['bind'], name: string): Ref<string | string[] | undefined> | undefined {
    switch (bind) {
    case 'state':
        return undefined;
    case 'params':
        return useRouteParams(name);
    case 'query':
        return useRouteQuery(name);
    }
}

const getInnerValue = (name: string, option: ReactiveParamOption) => {
    const core = useCore();

    if (option.bind === 'state') {
        return core.params[name].value;
    }

    const ref = core.params[name]?.ref;

    const result = Array.isArray(ref?.value) ? ref?.value[0] : ref?.value;

    if (option.type === 'boolean') {
        if (option.default?.value != null) {
            return result !== undefined ? !option.default?.value : option.default?.value;
        } else {
            return result !== undefined;
        }
    }

    if (result == null) {
        return null;
    }

    switch (option.type) {
    case 'number':
        return Number.parseInt(result, 10);
    case 'enum':
        if (option.values.value.includes(result)) {
            return result;
        } else {
            return null;
        }
    default:
        return result;
    }
};

export const getValue = (name: string) => {
    const core = useCore();

    return getInnerValue(name, core.params[name].option)
      ?? getDefault(core.params[name].option);
};

export const setValue = (name: string, newValue: any) => {
    const core = useCore();

    const option = core.params[name]?.option;

    if (option.readonly) {
        return;
    }

    const realKey = option.name ?? name;

    if (option.bind === 'state') {
        core.params[name].value = newValue;
        return;
    }

    const ref = core.params[name].ref;

    if (option.bind === 'params') {
        if (option.type === 'boolean') {
            if (newValue === true) {
                ref.value = realKey;
            } else {
                ref.value = null;
            }
        } else {
            ref.value = newValue ?? undefined;
        }
    } else {
        if (option.type === 'boolean') {
            if (option.default?.value != null) {
                if (newValue != option.default?.value) {
                    ref.value = null;
                } else {
                    ref.value = undefined;
                }
            } else {
                if (newValue === true) {
                    ref.value = null;
                } else {
                    ref.value = undefined;
                }
            }
        } else {
            if (newValue === option.default?.value) {
                ref.value = undefined;
            } else {
                ref.value = newValue ?? undefined;
            }
        }
    }
};

export function useParam<T extends ParamOption>(name: string, option: T): ParamRefType<T> {
    const core = useCore();

    const ref = useRouterRef(option.bind, option.name ?? name);

    core.params[name] = {
        option: toReactiveOption(option),
        value:  undefined,
        ref,
    };

    if (option.readonly) {
        return computed(() => getValue(name)) as any;
    } else {
        return computed({
            get() { return getValue(name); },
            set(newValue) { setValue(name, newValue); },
        }) as any;
    }
}

export function clearParam(): void {
    const core = useCore();

    for (const key of Object.keys(core.params)) {
        delete core.params[key];
    }
}
