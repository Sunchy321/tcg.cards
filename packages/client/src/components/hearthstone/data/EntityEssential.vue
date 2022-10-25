<template>
    <q-btn
        outline dense no-caps
        @click="show = true"
    >
        <slot>{{ capitalize(displayName) }}</slot>
        <slot name="append" />
        <q-dialog v-model="show" full-width>
            <q-card class="q-pa-md" style="width: 80%">
                <div class="flex">
                    <q-input
                        v-model="cardId"
                        flat dense outlined
                    />
                </div>
            </q-card>
        </q-dialog>
    </q-btn>
</template>

<script lang="ts">
import {
    PropType, defineComponent, ref, computed,
} from 'vue';

import { useHearthstone } from 'src/stores/games/hearthstone';

import { EntityEssential } from 'interface/hearthstone/format-change';

import { capitalize } from 'lodash';

export default defineComponent({
    name: 'EntityEssential',

    props: {
        modelValue: {
            type:     Object as PropType<EntityEssential>,
            required: true,
        },
        name: {
            type:    String,
            default: undefined,
        },
    },

    emits: ['update:modelValue'],

    setup(props, { emit }) {
        const hearthstone = useHearthstone();

        const show = ref(false);

        const entity = computed(() => props.modelValue);

        const updateEntity = (key: keyof EntityEssential, value: any) => {
            emit('update:modelValue', { ...entity.value, [key]: value });
        };

        const displayName = computed(() => {
            const { locales, locale } = hearthstone;
            const defaultLocale = locales[0];

            const loc = entity.value.localization.find(l => l.lang === locale)
                ?? entity.value.localization.find(l => l.lang === defaultLocale)
                ?? entity.value.localization[0];

            if (loc != null) {
                return loc.name;
            }

            if (props.name != null) {
                return props.name;
            }

            return 'Entity';
        });

        const cardId = computed({
            get() { return entity.value.cardId ?? ''; },
            set(newValue: string) { updateEntity('cardId', newValue); },
        });

        return {
            show,

            displayName,
            cardId,

            capitalize,
        };
    },
});
</script>
