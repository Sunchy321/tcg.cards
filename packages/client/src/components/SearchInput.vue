<template>
    <render />
</template>

<script setup lang="ts">
import { computed, h } from 'vue';

import { QInput, QInputProps, QInputSlots, useQuasar } from 'quasar';

import Parser from '@search/parser';
import SearchError from '@search/parser/error';

import { last } from 'lodash';

type Props = Omit<QInputProps, 'hideBottomSpace' | 'modelValue'> & {
    modelValue: string;
};

const quasar = useQuasar();

const props = defineProps<Props>();

const emit = defineEmits<{
    'update:modelValue': [newValue: string];
}>();

const slots = defineSlots<Omit<QInputSlots, 'default'>>();

const result = computed(() => {
    const parser = new Parser(props.modelValue ?? '');

    try {
        const expr = parser.parse();

        return {
            tokens: expr.tokens,
        };
    } catch (e) {
        return {
            error:  e as SearchError,
            tokens: parser.tokens,
        };
    }
});

const isMobile = computed(() => quasar.platform.is.mobile);

const render = () => {
    if (isMobile.value) {
        return h(QInput, {
            ...props,
            'hideBottomSpace':     true,
            'onUpdate:modelValue': (newValue: string) => { emit('update:modelValue', newValue); },
        }, {
            ...slots,
        });
    }

    const { tokens, error } = result.value;

    const spans = tokens.map(v => {
        if (error != null) {
            if (
                (v.location[0] <= error.location[0] && error.location[0] < v.location[1])
                || (v.location[0] < error.location[1] && error.location[1] <= v.location[1])
            ) {
                const before = v.text.slice(0, error.location[0] - v.location[0]);
                const center = v.text.slice(
                    error.location[0] - v.location[0],
                    error.location[1] - v.location[0],
                );
                const after = v.text.slice(error.location[1] - v.location[0]);

                return h('span', { class: `search-token token-${v.type}` }, [
                    ...before.length > 0 ? [before] : [],
                    h('span', { class: 'search-error' }, center),
                    ...after.length > 0 ? [after] : [],
                ]);
            }
        }

        return h('span', { class: `search-token token-${v.type}` }, v.text);
    });

    if (
        error != null
        && error.type !== 'empty-input'
        && error.location[0] >= (last(tokens)?.location[1] ?? 0)
    ) {
        spans.push(h('span', { class: 'search-error' }, ' '));
    }

    return h(QInput, {
        'class':               'search-input',
        ...props,
        'hideBottomSpace':     true,
        'onUpdate:modelValue': (newValue: string) => { emit('update:modelValue', newValue); },
    }, {
        ...slots,
        default: () => h(
            'span',
            { class: 'q-field__native' },
            spans,
        ),
    });
};
</script>

<style lang="sass" scoped>
.search-input
    &:deep(.q-field__control-container)
        z-index: 0

    &:deep(span.q-field__native)
        position: absolute

        display: flex
        align-items: center

        height: 100%

        z-index: -1

    &:deep(input.q-field__native)
        color: transparent !important
        caret-color: rgba(0, 0, 0, 0.87)

    &.q-field--highlighted, &.q-field--filled
        & :deep(.search-error)
            text-decoration: underline wavy red

        & :deep(.token-id)
            color: black

        & :deep(.token-punc)
            color: $indigo

        & :deep(.token-string)
            color: $blue-grey

        & :deep(.token-regex)
            color: $brown

*:deep(.search-token), *:deep(.search-error)
    white-space: pre
</style>
