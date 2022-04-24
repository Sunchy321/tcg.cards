import { computed, watch } from 'vue';
import type { Ref, ComputedRef } from 'vue';

import { mapValues } from 'lodash';

import { useCore } from 'store/core';

export type Value<T> = Ref<T> | T | (() => T);

export type ParamType = 'enum' | 'string';
export type OptionType = 'params' | 'props' | 'query';

interface ParameterBase<T, R> {
    type: T;
    bind: OptionType;
    readonly?: R;
    key?: string;
    inTitle?: boolean;
}

export interface EnumParameter<R extends boolean> extends ParameterBase<'enum', R> {
    type: 'enum';
    values: Value<string[]>;
    default?: Value<string>;
    label?: (v: string) => string;
}

export interface StringParameter<R extends boolean> extends ParameterBase<'string', R> {
    type: 'string';
    default?: Value<string>;
}

export interface NumberParameter<R extends boolean> extends ParameterBase<'number', R> {
    type: 'number';
    default?: Value<number>;
}

export interface DateParameter<R extends boolean> extends ParameterBase<'date', R> {
    type: 'date';
    default?: Value<string>;
}

type ValueTypeMap = {
    enum: string;
    string: string;
    date: string;
    number: number;
};

export type ValueType<T> = T extends keyof ValueTypeMap ? ValueTypeMap[T] : never;

export type Parameter<R extends boolean> =
    DateParameter<R> | EnumParameter<R> | NumberParameter<R> | StringParameter<R>;

function isRef<T>(value: Value<T>): value is Ref<T> {
    return (value as any)?.value != null;
}

export function valueOf<T>(value: Value<T>): T {
    if (value instanceof Function) {
        return value();
    } else if (isRef(value)) {
        return value.value;
    } else {
        return value;
    }
}

export function getDefault(param: Parameter<any>): Value<any> {
    switch (param.type) {
    case 'enum':
        return valueOf(param.default) ?? valueOf(param.values)[0];
    case 'string':
        return valueOf(param.default) ?? '';
    case 'date':
        return valueOf(param.default) ?? new Date().toLocaleDateString('en-CA');
    case 'number':
        return valueOf(param.default) ?? 0;
    default:
        return undefined;
    }
}

export type FilePopup = {
    type: 'file';
    url: string;
    accept?: string;
};

export interface Action {
    action: string;
    icon?: string;
    popup?: FilePopup;
    handler: Record<string, (() => void) | ((payload: any) => void)> | (() => void) | ((payload: any) => void);
}

export type TitleType = 'input' | 'text';

export interface Option {
    title?: Value<string>;
    titleType?: TitleType;
    params?: Record<string, Parameter<any>>;
    actions?: Action[];
}

export type ParamObject<T, R extends boolean> = ParameterBase<T, R> & {
    value?: Ref<ValueType<T>>;
};

export type Result<O extends Option> = {
    [K in keyof O['params']]: O['params'][K] extends ParameterBase<infer T, infer R>
        ? R extends true
            ? ComputedRef<ValueType<T>>
            : Ref<ValueType<T>>
        : never;
};

export default function pageSetup<O extends Option>(option: O): Result<O> {
    const core = useCore();

    core.titleType = option.titleType ?? 'text';

    watch(
        () => valueOf(option.title ?? ''),
        title => { core.title = title; },
        { immediate: true },
    );

    const props: Record<string, Ref<any>> = { };

    for (const [k, param] of Object.entries(option.params ?? {})) {
        if (param.readonly != null && param.readonly === true) {
            props[k] = computed(() => core.paramValues[k]);
        } else {
            props[k] = computed({
                get: () => core.paramValues[k],
                set: (value: any) => { core.setParam(k, value); },
            });
        }
    }

    watch(
        () => mapValues(option.params ?? {}, param => {
            if (param.type === 'enum') {
                return {
                    ...param,
                    default: valueOf(param.default),
                    values:  valueOf(param.values),
                };
            } else {
                return {
                    ...param,
                    default: valueOf(param.default),
                };
            }
        }),
        params => { core.paramState = params; },
        { immediate: true },
    );

    core.actions = option.actions ?? [];

    return props as Result<O>;
}
