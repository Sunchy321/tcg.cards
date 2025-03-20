<template>
    <render />
</template>

<script setup lang="ts" generic="T">
import {
    ref, computed, watch, h, useAttrs, useSlots,
} from 'vue';

import { QInput } from 'quasar';

import type { QInputProps } from 'quasar';

const props = withDefaults(defineProps<{
    modelValue: QInputProps['modelValue'];
    isNumber?:  boolean;
}>(), { isNumber: false });

const emit = defineEmits<{
    'update:modelValue': [value: QInputProps['modelValue']];
}>();

const attrs = useAttrs();
const slots = useSlots();

const text = ref('');

const modelValueText = computed(() => {
    if (props.modelValue != null) {
        return props.modelValue.toString();
    } else {
        return '';
    }
});

watch(() => props.modelValue, () => { text.value = modelValueText.value; }, { immediate: true });

const textChanged = computed(() => text.value !== modelValueText.value);

const updateValue = () => {
    if (text.value === '') {
        emit('update:modelValue', '');
        return;
    }

    if (props.isNumber) {
        const value = Number.parseInt(text.value, 10);

        if (!Number.isNaN(value)) {
            emit('update:modelValue', value);
        }
    } else {
        emit('update:modelValue', text.value);
    }
};

const onKeypress = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
        updateValue();
    }
};

const onClear = () => {
    text.value = '';
    updateValue();
};

const render = () => h(QInput, {
    ...props,
    'modelValue':          text.value,
    'onUpdate:modelValue': (newValue: string) => { text.value = newValue; },
    'color':               textChanged.value ? 'positive' : undefined,
    'onKeypress':          onKeypress,
    'onClear':             onClear,
    ...attrs,
}, slots);

</script>
