import {
    Ref, computed, ref, ComputedRef, WritableComputedRef,
} from 'vue';

import { Value, toRef } from './index';

import { useRouter, useRoute } from 'vue-router';

import { omit } from 'lodash';
import { parseInt } from 'src/numeric';

type ParamBase = {
    readonly?: boolean ;
    bind: 'params' | 'query' | 'state';
    key?: string;
    inTitle?: boolean;
    label?: (id: string) => string;
};

type ParamOptionBoolean = { type: 'boolean', default?: Value<boolean>, icon?: [string, string] };
type ParamOptionString = { type: 'string', default?: Value<string> };
type ParamOptionNumber = { type: 'number', default?: Value<number> };
type ParamOptionEnum = { type: 'enum', values: Value<string[]>, default?: Value<string> };
type ParamOptionDate = { type: 'date', default?: Value<string> };

export type ParamOption = ParamBase & (
    ParamOptionBoolean | ParamOptionDate | ParamOptionEnum | ParamOptionNumber | ParamOptionString
);

type ParamBoolean = { type: 'boolean', default?: boolean, icon?: [string, string] };
type ParamString = { type: 'string', default?: string };
type ParamNumber = { type: 'number', default?: number };
type ParamEnum = { type: 'enum', values: string[], default?: string };
type ParamDate = { type: 'date', default?: string };

export type Parameter = ParamBase & (
    ParamBoolean | ParamDate | ParamEnum | ParamNumber | ParamString
);

type ParamType<T extends { type: string }> =
    T['type'] extends 'boolean' ? boolean :
        T['type'] extends 'number' ? number : string;

export type ParamResult<T> = {
    [K in keyof T]: T[K] extends { type: string }
        ? T[K] extends { readonly: true }
            ? ComputedRef<ParamType<T[K]>>
            : WritableComputedRef<ParamType<T[K]>>
        : never
};

function getDefault(def: Parameter): any {
    switch (def.type) {
    case 'boolean':
        return false;
    case 'string':
        return null;
    case 'enum':
        return def.values[0];
    case 'number':
        return 0;
    case 'date':
        return new Date().toISOString().split('T')[0];
    default:
        return null;
    }
}

export default function useParams(): {
    params: Ref<Record<string, any>>;
    paramOptions: Ref<Record<string, Parameter>>;
    initParams: (definition: Record<string, ParamOption>, append?: boolean) => void;
    deinitParams: (keys: string[]) => void;
} {
    const router = useRouter();
    const route = useRoute();

    const paramState = ref<Record<string, any>>({});

    const paramOptions = ref<Record<string, Parameter>>({});

    const initParams = (options: Record<string, ParamOption>, append = false) => {
        if (!append) {
            paramOptions.value = {};
        }

        for (const k of Object.keys(options)) {
            const opt = options[k];

            const def: Partial<Parameter> = {
                ...opt,
                ...opt.default != null ? { default: toRef(opt.default) } : {},
                ...opt.type === 'enum' ? { values: toRef(opt.values) } : {},
            } as any;

            (paramOptions.value as any)[k] = def as Parameter;
        }
    };

    const deinitParams = (keys: string[]) => {
        for (const k of keys) {
            delete paramOptions.value[k];
        }
    };

    const getValue = (def: Parameter, key: string) => {
        const realKey = def.key ?? key;

        if (def.bind === 'state') {
            return paramState.value[realKey];
        }

        const result = (
            def.bind === 'params'
                ? route.params[realKey]
                : route.query[realKey]
        ) as string;

        if (def.type === 'boolean') {
            if (def.default != null) {
                return result !== undefined ? !def.default : def.default;
            } else {
                return result !== undefined;
            }
        }

        if (result == null) {
            return null;
        }

        switch (def.type) {
        case 'number':
            return parseInt(result);
        case 'enum':
            if (def.values.includes(result)) {
                return result;
            } else {
                return null;
            }
        default:
            return result;
        }
    };

    const setValue = (def: Parameter, key: string, newValue: any) => {
        if (def.readonly) {
            return;
        }

        const realKey = def.key ?? key;

        if (def.bind === 'state') {
            paramState.value[realKey] = newValue;
        } else if (def.bind === 'params') {
            if (def.type === 'boolean') {
                if (newValue === true) {
                    void router.push({
                        params: { ...route.params, [realKey]: null },
                        query:  route.query,
                    });
                } else {
                    void router.push({
                        params: omit(route.params, [realKey]),
                        query:  route.query,
                    });
                }
            } else {
                void router.push({
                    params: { ...route.params, [realKey]: newValue ?? undefined },
                    query:  route.query,
                });
            }
        } else {
            if (def.type === 'boolean') {
                if (def.default != null) {
                    if (newValue !== def.default) {
                        void router.push({
                            query: { ...route.query, [realKey]: null },
                        });
                    } else {
                        void router.push({
                            query: omit(route.query, [realKey]),
                        });
                    }
                } else {
                    if (newValue === true) {
                        void router.push({
                            query: { ...route.query, [realKey]: null },
                        });
                    } else {
                        void router.push({
                            query: omit(route.query, [realKey]),
                        });
                    }
                }
            } else {
                if (newValue === def.default) {
                    void router.push({
                        query: omit(route.query, [realKey]),
                    });
                } else {
                    void router.push({
                        query: { ...route.query, [realKey]: newValue ?? undefined },
                    });
                }
            }
        }
    };

    const params = computed<Record<string, any>>({
        get() {
            const result: Record<string, any> = {};

            for (const k of Object.keys(paramOptions.value)) {
                const def = paramOptions.value[k] as Parameter;

                result[k] = getValue(def, k) ?? def.default ?? getDefault(def);
            }

            return result;
        },
        set(newValue) {
            const oldValue = params.value;

            for (const k of Object.keys(oldValue)) {
                if (oldValue[k] !== newValue[k]) {
                    setValue(paramOptions.value[k] as Parameter, k, newValue[k]);
                }
            }
        },
    });

    return {
        params,
        paramOptions,
        initParams,
        deinitParams,
    };
}
