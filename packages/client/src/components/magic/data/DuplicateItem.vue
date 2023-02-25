<style lang="sass" scoped>

.line
    padding: 5px

.item
    flex: 1 0 0

.same
    background-color: lightgrey

</style>

<script lang="ts">
import {
    VNode, PropType, defineComponent, h,
} from 'vue';

import { QBtn } from 'quasar';

import {
    flatten, isEqual, last, range, uniq,
} from 'lodash';

export default defineComponent({
    name: 'DuplicateItem',

    props: {
        values: {
            type:     Array as PropType<any[]>,
            required: true,
        },
    },

    emits: ['update-value'],

    setup(props, { emit }) {
        const placeholder = Symbol('placeholder');

        const isPrimary = (v: any) => ['boolean', 'string', 'number'].includes(typeof v) || v == null;

        const isPrimaryArray = (v: any) => Array.isArray(v) && v.every(e => isPrimary(e));

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

                if (lastIndex.endsWith('.')) {
                    return `${lastIndex.slice(0, -1)}:`;
                } else {
                    return `${lastIndex} = `;
                }
            })();

            if (values.every(v => v?.[0] === placeholder)) {
                return [h('tr', { class: 'line same' }, values.map(
                    v => h('td', { class: 'item', style: `padding-left: ${indent}px` }, ['[', '{'].includes(values[0][1]) ? [
                        `${prefix} ${values[0][1]}`,
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

                    ] : values[0][1]),
                ))];
            } else if (values.every(v => isPrimary(v) || isPrimaryArray(v))) {
                if (values.every(v => isEqual(v, values[0]))) {
                    return [h('tr', { class: 'line same' }, values.map(
                        v => h('td', { class: 'item', style: `padding-left: ${indent}px` }, `${prefix} ${JSON.stringify(v)}`),
                    ))];
                } else {
                    return [h('tr', { class: 'line' }, values.map(
                        v => h('td', { class: 'item', style: `padding-left: ${indent}px` }, [
                            `${prefix} ${JSON.stringify(v)}`,
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
                const keys = uniq(flatten(values.map(v => Object.keys(v ?? {})))).sort();

                const lines = flatten(keys.map(k => render(values.map(v => v?.[k] ?? null), [...index, `${k}.`]))).map((l, i, a) => {
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
                console.log(values, index);

                return [h('tr', values.map(() => h('td', 'ERROR')))];
            }
        };

        return () => h('table', { class: 'code' }, render(props.values));
    },
});

</script>
