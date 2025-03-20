<template>
    <div class="q-pa-md">
        <div class="row items-center q-mb-md">
            <q-select
                v-model="id"
                dense outlined
                use-input hide-selected
                fill-input
                input-debounce="0"
                :options="filteredSet"
                @filter="filterFn"
            />

            <q-input
                v-model="setId"
                class="q-ml-md"
                outlined dense
            />

            <q-space />

            <q-btn
                icon="mdi-upload"
                flat dense round
                @click="save"
            />

            <q-btn
                icon="mdi-plus"
                flat dense round
                @click="newSet"
            />
        </div>

        <div>
            <div v-for="l in localization" :key="l.lang" class="row items-center q-gutter-md">
                <div class="code" style="flex-basis: 25px">
                    {{ l.lang }}
                </div>
                <q-input
                    :model-value="l.name"
                    class="col"
                    dense outlined
                    @update:model-value="v => assignName(l.lang, v as string)"
                />
            </div>
        </div>
    </div>
</template>

<script lang="ts">

import {
    defineComponent, ref, computed, watch, onMounted,
} from 'vue';

import type {
    QSelectProps,
} from 'quasar';

import { useRouter, useRoute } from 'vue-router';
import { useHearthstone } from 'store/games/hearthstone';

import controlSetup from 'setup/control';

import { Set, SetLocalization } from 'interface/hearthstone/set';

import { apiGet } from 'boot/server';

export default defineComponent({
    setup() {
        const router = useRouter();
        const route = useRoute();
        const hearthstone = useHearthstone();

        const { controlGet, controlPost } = controlSetup();

        const set = ref<string[]>([]);
        const data = ref<Set | null>(null);
        const filteredSet = ref<string[]>([]);

        const id = computed({
            get() { return route.query.id as string ?? set.value[0]; },
            set(newValue: string) {
                void router.replace({
                    query: {
                        ...route.query,
                        id: newValue,
                    },
                });
            },
        });

        const setId = computed({
            get() { return data?.value?.setId ?? ''; },
            set(newValue: string) {
                if (data.value != null) {
                    data.value.setId = newValue;
                }
            },
        });

        const localization = computed(() => hearthstone.locales.map(
            l => data.value?.localization?.find(v => v.lang === l) ?? { lang: l } as SetLocalization,
        ));

        const loadList = async () => {
            const { data: sets } = await apiGet<string[]>('/hearthstone/set');

            set.value = sets;

            if (data.value == null) {
                void loadData();
            }
        };

        const loadData = async () => {
            if (data.value != null) {
                await save();
            }

            const { data: result } = await controlGet<Set>('/hearthstone/set/raw', {
                id: id.value,
            });

            data.value = result;
        };

        const filterFn = (val: string, update: Parameters<NonNullable<QSelectProps['onFilter']>>[1]) => {
            if (val === '') {
                update(
                    () => { filteredSet.value = set.value; },
                    () => { /* no-op */ },
                );
            } else {
                update(
                    () => { filteredSet.value = set.value.filter(s => s.includes(val)); },
                    () => { /* no-op */ },
                );
            }
        };

        const assignName = (lang: string, name: string) => {
            if (data.value == null) {
                return;
            }

            const loc = data.value.localization.find(l => l.lang === lang);

            if (loc == null) {
                data.value.localization = [...data.value.localization, { lang, name }];
            } else {
                loc.name = name;
            }
        };

        const prettify = () => {
            if (data.value == null) {
                return;
            }

            data.value.localization = data.value.localization.filter(
                l => l.name != null && l.name !== '',
            );

            for (const l of data.value.localization) {
                if (l.name === '') {
                    delete l.name;
                }
            }
        };

        const save = async () => {
            if (data.value != null && data.value.setId !== '') {
                prettify();

                await controlPost('/hearthstone/set/save', { data: data.value });

                await loadList();
            }
        };

        const newSet = async () => {
            await save();

            id.value = set.value[0];

            data.value = {
                setId:        '',
                localization: [],
                type:         '',
                cardCount:    [0, 0],
            };
        };

        watch(set, () => { filteredSet.value = set.value; });
        watch(id, loadData);
        onMounted(loadList);

        return {
            id,
            setId,
            localization,

            filteredSet,

            save,
            newSet,
            filterFn,
            assignName,
        };
    },
});
</script>
