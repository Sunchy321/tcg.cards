/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Ref, ComputedRef, computed, watch } from 'vue';

import { mapValues } from 'lodash';

import { useStore } from 'src/store';

export type Value<T> = T | Ref<T> | (() => T);

export type ParamType = 'enum' | 'string';
export type OptionType = 'params' | 'query' | 'props'

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
    EnumParameter<R> | StringParameter<R> | NumberParameter<R> | DateParameter<R>;

export function getDefault(param: Parameter<any>): Value<any> {
    switch (param.type) {
    case 'enum':
        return value(param.default) ?? value(param.values)[0];
    case 'string':
        return value(param.default) ?? '';
    case 'date':
        return value(param.default) ?? new Date().toLocaleDateString('en-CA');
    case 'number':
        return value(param.default) ?? 0;
    }
}

export interface Action {
    action: string;
    icon?: string;
    handler: () => void;
}

export interface Option {
    title?: Value<string>;
    titleType?: 'text' | 'input';
    params?: Record<string, Parameter<any>>;
    actions?: Action[];
}

export type ParamObject<T, R extends boolean> = ParameterBase<T, R> & {
    value: Ref<ValueType<T>>;
}

export type Result<O extends Option> = {
    [K in keyof O['params']]: O['params'][K] extends ParameterBase<infer T, infer R>
        ? R extends true
            ? ComputedRef<ValueType<T>>
            : Ref<ValueType<T>>
        : never;
}

function isRef<T>(value: Value<T>): value is Ref<T> {
    return (value as any)?.value != null;
}

export function value<T>(value: Value<T>): T {
    if (value instanceof Function) {
        return value();
    } else if (isRef(value)) {
        return value.value;
    } else {
        return value;
    }
}

export default function<O extends Option>(option: O): Result<O> {
    const store = useStore();

    store.commit('titleType', option.titleType ?? 'text');

    watch(
        () => value(option.title ?? ''),
        title => store.commit('title', title),
        { immediate: true },
    );

    const props: Record<string, Ref<any>> = { };

    for (const k in option.params ?? {}) {
        const param = (option.params ?? {})[k];

        if (param.readonly) {
            props[k] = computed(() => store.getters.paramValues[k]);
        } else {
            props[k] = computed({
                get: () => store.getters.paramValues[k],
                set: (value: any) => store.commit('param', { key: k, value }),
            });
        }
    }

    watch(
        () => mapValues(option.params ?? {}, param => {
            if (param.type === 'enum') {
                return {
                    ...param,
                    default: value(param.default),
                    values:  value(param.values),
                };
            } else {
                return {
                    ...param,
                    default: value(param.default),
                };
            }
        }),
        params => store.commit('params', params),
        { immediate: true });

    store.commit('actions', option.actions ?? []);

    return props as Result<O>;
}
