<script lang="ts">
import {
    PropType, defineComponent, ref, computed, watch, h,
} from 'vue';

import { QInput } from 'quasar';

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

    setup(props, { emit, slots }) {
        const text = ref('');

        watch(() => props.modelValue, () => {
            text.value = props.modelValue.join(', ');
        }, { immediate: true });

        const textChanged = computed(() => text.value !== props.modelValue.join(', '));

        const updateValue = () => {
            if (text.value === '') {
                emit('update:modelValue', []);
                return;
            }

            if (props.isNumber) {
                const value = text.value
                    .split(',')
                    .map(v => Number.parseInt(v.trim(), 10));

                if (value.every(v => !Number.isNaN(v))) {
                    emit('update:modelValue', value);
                }
            } else {
                emit('update:modelValue', text.value.split(',').map(v => v.trim()));
            }
        };

        const onKeypress = (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                updateValue();
            }
        };

        return () => h(QInput, {
            'modelValue':          text.value,
            'onUpdate:modelValue': (newValue: string) => { text.value = newValue; },
            'color':               textChanged.value ? 'positive' : undefined,
            'onKeypress':          onKeypress,
        }, slots);
    },
});
</script>
