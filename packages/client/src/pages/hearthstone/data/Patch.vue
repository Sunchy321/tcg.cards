<template>
    <q-page class="q-pa-md">
        <div class="row items-center q-mb-md q-gutter-md">
            <q-select
                v-model="version"
                dense outlined
                input-debounce="0"
                :options="patches"
            />

            <q-space />

            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="save"
            />
        </div>

        <div>
            <q-input v-model="shortName" dense outlined placeholder="Short Name" />
        </div>
    </q-page>
</template>

<script lang="ts">
import {
    defineComponent, ref, computed, watch, onMounted,
} from 'vue';

import controlSetup from 'src/setup/control';

import { Patch } from 'interface/hearthstone/patch';

import { apiGet } from 'src/boot/backend';
import pageSetup from 'src/setup/page';

export default defineComponent({
    name: 'DataPatch',

    setup() {
        const { controlGet, controlPost } = controlSetup();

        const patches = ref<string[]>([]);
        const data = ref<Patch | null>(null);

        const { version } = pageSetup({
            appendParam: true,
            params:      {
                version: {
                    type:    'string',
                    bind:    'query',
                    default: () => patches.value[0],
                },
            },
        });

        const shortName = computed({
            get() { return data.value?.shortName ?? ''; },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.shortName = newValue;
                }
            },
        });

        const save = async () => {
            if (data.value != null) {
                await controlPost('/hearthstone/patch/save', { data: data.value });
            }
        };

        const loadData = async () => {
            if (version.value == null) {
                return;
            }

            if (data.value != null) {
                await save();
            }

            const { data: result } = await controlGet<Patch>('/hearthstone/patch/raw', {
                version: version.value,
            });

            data.value = result;
        };

        const loadList = async () => {
            const { data: patchList } = await apiGet<string[]>('/hearthstone/patch');

            patches.value = patchList;

            if (data.value == null) {
                void loadData();
            }
        };

        watch(version, loadData);
        onMounted(loadList);

        return {
            patches,
            version,

            shortName,

            save,
        };
    },
});
</script>
