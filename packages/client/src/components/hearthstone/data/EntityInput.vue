<template>
    <q-input v-model="input" :label="modelValue">
        <template #append>
            <q-btn
                icon="mdi-magnify"
                flat dense round
                @click="search"
            />
        </template>
    </q-input>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

import { useHearthstone } from 'src/stores/games/hearthstone';

import { Entity } from 'interface/hearthstone/entity';

import { apiGet } from 'src/boot/backend';

export default defineComponent({
    name: 'EntityInput',

    props: {
        modelValue: {
            type:     String,
            required: true,
        },
        version: {
            type:    Number,
            default: undefined,
        },
    },

    emits: ['update:modelValue'],

    setup(props, { emit }) {
        const hearthstone = useHearthstone();

        const input = ref('');

        const search = async () => {
            if (props.modelValue !== '' && props.modelValue != null) {
                const { data } = await apiGet<Entity>('/hearthstone/card', {
                    id: props.modelValue,
                });

                const { locale, locales } = hearthstone;
                const defaultLocale = locales[0];

                const loc = data.localization.find(l => l.lang === locale)
                    ?? data.localization.find(l => l.lang === defaultLocale)
                    ?? data.localization[0];

                if (data != null) {
                    input.value = loc.name;
                }
            } else {
                const { data } = await apiGet<Entity>('/hearthstone/card/name', {
                    name: input.value,
                });

                const { locale, locales } = hearthstone;
                const defaultLocale = locales[0];

                const loc = data.localization.find(l => l.lang === locale)
                    ?? data.localization.find(l => l.lang === defaultLocale)
                    ?? data.localization[0];

                if (data != null) {
                    input.value = loc.name;
                    emit('update:modelValue', data.cardId);
                }
            }
        };

        return {
            input,
            search,
        };
    },
});
</script>
