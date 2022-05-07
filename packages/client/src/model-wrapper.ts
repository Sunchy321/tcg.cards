import { computed, WritableComputedRef } from 'vue';

export default function modelWrapper<P, N extends string & keyof P>(
    name: N,
    props: P,
    emit: (event: `update:${N}`, args: P[N]) => void,
): WritableComputedRef<P[N]> {
    return computed({
        get(): P[N] {
            return props[name];
        },
        set(newValue: P[N]) {
            emit(`update:${name}`, newValue);
        },
    });
}
