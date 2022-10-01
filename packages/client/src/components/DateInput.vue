<template>
    <q-input
        :model-value="modelValue"
        @update:model-value="input"
    >
        <template #append>
            <q-icon name="mdi-calendar" class="cursor-pointer">
                <q-popup-proxy ref="dateProxy">
                    <q-date
                        :model-value="modelValue"
                        mask="YYYY-MM-DD"
                        minimal
                        :events="realEvents.map(e => e.date)"
                        :event-color="eventColor"
                        v-bind="dateAttrs"
                        @update:model-value="dateInput"
                    />
                </q-popup-proxy>
            </q-icon>
        </template>

        <template v-for="(slot, index) of Object.keys($slots)" :key="index" #[slot]>
            <slot :name="slot" />
        </template>
    </q-input>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

import type { PropType } from 'vue';
import type { QInputProps, QDateProps } from 'quasar';

export default defineComponent({
    props: {
        modelValue: { type: String as PropType<string | null>, default: undefined },

        events:   { type: Array as PropType<{ date: string, color: string }[]>, default: () => [] },
        dateFrom: { type: String, default: undefined },
        dateTo:   { type: String, default: undefined },
    },

    emits: ['update:modelValue'],

    setup(props, { emit }) {
        const dateProxy = ref<any>(null);

        const toQuasarDate = (v: string) => v.replace(/-/g, '/');

        const realDateFrom = computed(() => (props.dateFrom != null ? toQuasarDate(props.dateFrom) : props.dateFrom));
        const realDateTo = computed(() => (props.dateTo != null ? toQuasarDate(props.dateTo) : props.dateTo));

        const realEvents = computed(() => props.events?.map(v => ({
            date:  toQuasarDate(v.date),
            color: v.color,
        })) ?? []);

        const dateAttrs = computed(() => {
            const result: Record<string, any> = {};

            if (realDateFrom.value != null) {
                result.navigationMinYearMonth = realDateFrom.value.slice(0, 7);
            }

            if (realDateTo.value != null) {
                result.navigationMaxYearMonth = realDateTo.value.slice(0, 7);
            }

            if (realDateFrom.value != null || realDateTo.value != null) {
                result.options = (d: string) => {
                    if (realDateFrom.value != null && d < realDateFrom.value) {
                        return false;
                    }

                    if (realDateTo.value != null && d > realDateTo.value) {
                        return false;
                    }

                    return true;
                };
            }

            return result;
        });

        const eventColor = (v: string) => realEvents.value.find(e => e.date === v)!.color;

        const input = (v: QInputProps['modelValue']) => {
            dateProxy.value.hide();
            emit('update:modelValue', v);
        };

        const dateInput = (v: QDateProps['modelValue']) => {
            dateProxy.value.hide();
            emit('update:modelValue', v);
        };

        return {
            dateProxy,

            realEvents,
            dateAttrs,

            eventColor,
            input,
            dateInput,
        };
    },
});
</script>
