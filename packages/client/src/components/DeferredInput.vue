<template>
    <q-input
        v-model="text"
        :color="textChanged ? 'positive' : null"
        @keypress.enter="updateValue"
    />
</template>

<style lang="sass" scoped>

</style>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';

export default defineComponent({
    props: {
        modelValue: {
            type:     String,
            required: true,
        },
        isNumber: {
            type:    Boolean,
            default: false,
        },
    },

    emits: ['update:modelValue'],

    setup(props, { emit }) {
        const text = ref('');

        watch(() => props.modelValue, () => { text.value = props.modelValue; }, { immediate: true });

        const textChanged = computed(() => text.value !== props.modelValue);

        const updateValue = () => emit('update:modelValue', text.value);

        return {
            text,
            textChanged,
            updateValue,
        };
    },
});
</script>
