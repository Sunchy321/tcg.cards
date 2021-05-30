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
import { PropType, defineComponent, ref, computed, watch } from 'vue';

export default defineComponent({
    props: {
        modelValue: {
            type:     Array as PropType<any[]>,
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        watch(() => props.modelValue, () => {
            text.value = props.modelValue.join(', ');
        });

        const textChanged = computed(() => text.value !== props.modelValue.join(', '));

        const updateValue = () => {
            if (props.isNumber) {
                const value = text.value
                    .split(',')
                    .map(v => Number.parseInt(v.trim()));

                if (value.every(v => !Number.isNaN(v))) {
                    emit('update:modelValue', value);
                }
            } else {
                emit('update:modelValue', text.value.split(',').map(v => v.trim()));
            }
        };

        return {
            text,
            textChanged,
            updateValue,
        };
    },
});
</script>
