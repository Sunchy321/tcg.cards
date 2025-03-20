<template>
    <root />
</template>

<script setup lang="ts">
import type { VNode } from 'vue';
import { h } from 'vue';
import { QBtn } from 'quasar';

import {
    flatten, isEqual, last, range, uniq,
} from 'lodash';

const props = defineProps<{
    values:    any[];
    keyOrder?: (key: string, values: any[], index: string[]) => number | null;
}>();

const emit = defineEmits<{
    'update-value': [args: { index: string[], value: any }];
}>();

const slots = defineSlots<{
    default?: (props: {
        text:  string;
        value: any;
        index: string[];
        which: number;
    }) => VNode[];
}>();

const placeholder = Symbol('placeholder');

const isPrimary = (v: any) => ['boolean', 'string', 'number'].includes(typeof v) || v == null;

const isPrimaryArray = (v: any) => Array.isArray(v) && v.every(e => isPrimary(e));

const isAllEqual = (values: any[]) => {
    if (values.length === 0) {
        return true;
    }

    return values.every(v => isEqual(v, values[0]));
};

const keyOrder = (key: string, values: any[], index: string[]) => {
    if (props.keyOrder != null) {
        const order = props.keyOrder(key, values, index);

        if (order != null) {
            return order;
        }
    }

    if (!isAllEqual(values.map(v => v?.[key]))) {
        if (values.every(v => isPrimary(v?.[key]) || isPrimaryArray(v?.[key]))) {
            return 2;
        } else {
            return 1;
        }
    } else {
        return 0;
    }
};

const renderItem = (args: { text: string, value: any, index: string[], which: number }) => {
    if (slots.default != null) {
        return slots.default(args);
    } else {
        return args.text;
    }
};

const render = (values: any[], index: string[] = []): VNode[] => {
    if (values.length === 0) {
        return [h('table')];
    }

    const indent = index.length * 20;

    const prefix = (() => {
        const lastIndex = last(index);

        if (lastIndex == null) {
            return '';
        }

        if (lastIndex.startsWith('.')) {
            return `${lastIndex.slice(1)}:`;
        } else {
            return `${lastIndex} = `;
        }
    })();

    if (values.every(v => v?.[0] === placeholder)) {
        return [h('tr', { class: 'compare-line compare-same' }, values.map(
            (v, i) => h('td', { class: 'compare-item', style: `padding-left: ${indent}px` }, ['[', '{'].includes(values[0][1])
                ? [
                    renderItem({
                        text:  `${prefix} ${values[0][1]}`,
                        value: values[0][1],
                        index,
                        which: i,
                    }),
                    h(QBtn, {
                        class:   'q-ml-md',
                        icon:    'mdi-check',
                        size:    'sm',
                        flat:    true,
                        dense:   true,
                        round:   true,
                        onClick: () => {
                            emit('update-value', {
                                index,
                                value: v[2],
                            });
                        },
                    }),
                ]
                : values[0][1]),
        ))];
    } else if (values.every(v => isPrimary(v) || isPrimaryArray(v))) {
        if (values.every(v => isEqual(v, values[0]))) {
            return [h('tr', { class: 'compare-line compare-same' }, values.map(
                (v, i) => h(
                    'td',
                    { class: 'compare-item', style: `padding-left: ${indent}px` },
                    renderItem({
                        text:  `${prefix} ${JSON.stringify(v)}`,
                        value: v,
                        index,
                        which: i,
                    }),
                ),
            ))];
        } else {
            return [h('tr', { class: 'compare-line' }, values.map(
                (v, i) => h('td', { class: 'compare-item', style: `padding-left: ${indent}px` }, [
                    renderItem({
                        text:  `${prefix} ${JSON.stringify(v)}`,
                        value: v,
                        index,
                        which: i,
                    }),
                    h(QBtn, {
                        class:   'q-ml-md',
                        icon:    'mdi-check',
                        size:    'sm',
                        flat:    true,
                        dense:   true,
                        round:   true,
                        onClick: () => {
                            emit('update-value', {
                                index,
                                value: v,
                            });
                        },
                    }),
                ]),
            ))];
        }
    } else if (values.every(v => v == null || Array.isArray(v))) {
        const length = Math.max(...values.map(v => v?.length ?? 0));

        const lines = flatten(range(length).map(i => render(values.map(v => v?.[i] ?? null), [...index, `[${i}]`]))).map((l, i, a) => {
            if (l.children != null && Array.isArray(l.children)) {
                l.children = l.children.map((c, j) => {
                    if (values[j] == null) {
                        if (i === 0) {
                            return h('td', { rowspan: a.length }, 'null');
                        } else {
                            return null;
                        }
                    } else {
                        return c;
                    }
                }).filter(v => v != null);
            }

            return l;
        });

        return [
            ...render(values.map(v => [placeholder, '[', v]), index),
            ...lines,
            ...render(values.map(() => [placeholder, ']']), index),
        ];
    } else if (values.every(v => v == null || !isPrimary(v))) {
        const keys = uniq(flatten(values.map(v => Object.keys(v ?? {})))).sort((a, b) => {
            const aOrder = keyOrder(a, values, index);
            const bOrder = keyOrder(b, values, index);

            if (aOrder !== bOrder) {
                return aOrder > bOrder ? -1 : 1;
            } else {
                return a < b ? -1 : a > b ? 1 : 0;
            }
        });

        const lines = flatten(keys.map(k => render(values.map(v => v?.[k] ?? null), [...index, `.${k}`]))).map((l, i, a) => {
            if (l.children != null && Array.isArray(l.children)) {
                l.children = l.children.map((c, j) => {
                    if (values[j] == null) {
                        if (i === 0) {
                            return h('td', { rowspan: a.length }, 'null');
                        } else {
                            return null;
                        }
                    } else {
                        return c;
                    }
                }).filter(v => v != null);
            }

            return l;
        });

        return [
            ...render(values.map(v => [placeholder, '{', v]), index),
            ...lines,
            ...render(values.map(() => [placeholder, '}']), index),
        ];
    } else {
        console.log('ERROR: ', values, index);

        return [h('tr', values.map(() => h('td', 'ERROR')))];
    }
};

const root = () => h('table', { class: 'compare-table code' }, render(props.values));

</script>

<style lang="sass">
.compare-table
    width: 100%

.compare-line
    display: flex

    margin: 2px

    &.compare-same
        background-color: lightgrey

.compare-item
    display: flex

    align-items: center

    flex: 1 0 0

</style>
