/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Ref, ComputedRef, computed, watch } from 'vue';

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

type ValueTypeMap = {
    enum: string;
    string: string;
    number: number;
};

export type ValueType<T> = T extends keyof ValueTypeMap ? ValueTypeMap[T] : never;

export type Parameter<R extends boolean> =
    EnumParameter<R> | StringParameter<R> | NumberParameter<R>;

export function getDefault(param: Parameter<any>): Value<any> {
    if (param.type === 'enum') {
        return value(param.default) ?? value(param.values)[0];
    } else if (param.type === 'string') {
        return value(param.default) ?? '';
    } else { // is number
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

function action<T>(value: Value<T>, action: (value: T) => void) {
    if (value instanceof Function) {
        watch(value, () => action(value()), { immediate: true });
    } else if (isRef(value)) {
        watch(value, () => action(value.value), { immediate: true });
    } else {
        action(value);
    }
}

export default function<O extends Option>(option: O): Result<O> {
    const store = useStore();

    store.commit('titleType', option.titleType ?? 'text');

    action(option.title ?? '', v => store.commit('title', v));

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

    store.commit('params', option.params ?? { });
    store.commit('actions', option.actions ?? []);

    return props as Result<O>;
}
