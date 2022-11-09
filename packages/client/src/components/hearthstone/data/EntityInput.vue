<template>
    <q-input v-model="input" :label="modelValue" @keypress.enter="search">
        <template #append>
            <slot name="append" />
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

const mercenariesPreset = [
    'BARL_002H_01',
    'BARL_005H_02',
    'BARL_007H_01',
    'BARL_008H_02',
    'BARL_009H_01',
    'BARL_010H_02',
    'BARL_012H_01',
    'BARL_013H_01',
    'BARL_015H_02',
    'BARL_016H_01',
    'BARL_017H_01',
    'BARL_018H_03',
    'BARL_021H_01',
    'BARL_023H_01',
    'BARL_024H_01',
    'BARL_025H_01',
    'LETL_001H_02',
    'LETL_002H_02',
    'LETL_003H_02',
    'LETL_005H_01 ',
    'LETL_006H_01',
    'LETL_007H_01',
    'LETL_009H_01',
    'LETL_010H_01',
    'LETL_011H_01',
    'LETL_012H_01',
    'LETL_014H_01',
    'LETL_015H_01',
    'LETL_016H_02',
    'LETL_017H_01',
    'LETL_019H_02',
    'LETL_020H_01',
    'LETL_021H_02',
    'LETL_024H_01',
    'LETL_026H_01',
    'LETL_027H_02',
    'LETL_028H_02',
    'LETL_029H_01',
    'LETL_030H_01',
    'LETL_031H_02',
    'LETL_032H_01',
    'LETL_033H_01',
    'LETL_034H_01',
    'LETL_036H_01',
    'LETL_037H_02',
    'LETL_038H_02',
    'LETL_039H_02',
    'LETL_040H_01',
    'LETL_041H_03',
    'LT21_01H_01',
    'LT21_02H_01',
    'LT21_03H_01',
    'LT21_04H_01',
    'LT21_05H_01',
    'LT21_07H_01 ',
    'LT22_001H_01',
    'LT22_002H_01',
    'LT22_003H_01',
    'LT22_004H_01',
    'LT22_005H_01',
    'LT22_006H_02',
    'LT22_007H_02 ',
    'LT22_008H_02',
    'LT22_009H_02',
    'LT22_010H_02 ',
    'LT22_011H_02',
    'LT22_012H_01',
    'LT22_013H_01',
    'LT22_014H_01',
    'LT22_015H_02',
    'LT22_016H_01',
    'LT22_023H_01',
    'LT22_024H_01',
    'LT23_011H_01',
    'LT23_016H_03',
    'LT23_017H_01',
    'LT23_018H_01',
    'LT23_019H_01',
    'LT23_020H_01',
    'LT23_021H_01',
    'LT23_022H_01',
    'LT23_024H_02',
    'LT23_025H_01',
    'LT23_026H_01',
    'LT23_028H_03',
    'LT23_029H_01',
    'LT23_030H_01',
    'LT23_031H_01',
    'LT23_032H_01',
    'LT23_033H_01',
    'LT23_034H_01',
    'LT23_035H_01',
    'LT23_036H_01',
    'LT23_037H_01',
    'LT24_001H_01',
    'LT24_002H_03',
    'LT24_003H_01',
    'LT24_007H_01',
    'LT24_008H_01',
    'LT24_010H_02',
    'LT24_011H_02',
    'LT24_016H_01',
    'LT24_017H_01',
    'LT24_019H_01',
    'LT24_020H_01',
    'LT24_021H_01',
    'LT24_027H_01',
    'SWL_01H_01',
    'SWL_06H_01',
    'SWL_10H_02',
    'SWL_13H_01',
    'SWL_14H_02',
    'SWL_25H_01',
    'SWL_26H_03',
];

export default defineComponent({
    name: 'EntityInput',

    props: {
        modelValue: {
            type:     String,
            required: true,
        },
        format: {
            type:    String,
            default: undefined,
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

        const getData = async (name: string, id: string): Promise<Entity | Entity[]> => {
            name = name.trim();

            if (name.startsWith('!') || name.includes('_')) {
                const { data } = await apiGet<Entity>('/hearthstone/card', {
                    id:      name.replace(/^!/, '').trim(),
                    version: props.version,
                });

                return data;
            }

            if (name === '') {
                const { data } = await apiGet<Entity>('/hearthstone/card', {
                    id,
                    version: props.version,
                });

                return data;
            }

            let { data } = await apiGet<Entity[]>('/hearthstone/card/name', {
                name,
                version: props.version,
            });

            if (props.format === 'mercenaries') {
                if (data.some(d => mercenariesPreset.includes(d.cardId))) {
                    data = data.filter(d => mercenariesPreset.includes(d.cardId));
                }
            }

            if (data.length === 1) {
                return data[0];
            } else {
                return data;
            }
        };

        const search = async () => {
            const data = await getData(input.value, props.modelValue);

            if (Array.isArray(data)) {
                input.value = data.map(v => v.cardId).sort().join(', ');
                return;
            }

            const { locale, locales } = hearthstone;
            const defaultLocale = locales[0];

            const loc = data.localization.find(l => l.lang === locale)
                    ?? data.localization.find(l => l.lang === defaultLocale)
                    ?? data.localization[0];

            if (data != null) {
                input.value = loc.name;
                emit('update:modelValue', data.cardId);
            }
        };

        return {
            input,
            search,
        };
    },
});
</script>
