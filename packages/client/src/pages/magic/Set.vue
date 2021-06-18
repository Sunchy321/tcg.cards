<template>
    <q-page class="q-pa-md">
        <div class="flex items-center">
            <div class="name">{{ name }}</div>
            <div class="col-grow" />
            <q-btn
                v-if="wotcLink != null"
                class="q-mr-sm"
                type="a"
                :href="wotcLink"
                target="_blank"
                icon="mdi-link"
                flat round dense
            />
            <q-btn
                class="q-mr-sm"
                type="a"
                :href="apiLink"
                target="_blank"
                icon="mdi-code-json"
                flat round dense
            />
            <q-btn
                v-if="isAdmin"
                :to="editorLink"
                icon="mdi-file-edit"
                flat round dense
            />
        </div>
        <div class="rarities q-my-md">
            <div v-for="r in rarities" :key="r" class="rarity column items-center">
                <img :src="iconUrl(r)">
                <div>{{ $t('magic.rarity.' + r) }}</div>
            </div>
        </div>
        <div class="langs q-my-md">
            <div
                v-for="l in langs" :key="l"
                class="lang q-btn q-btn--outline q-btn--rectangle q-btn--dense text-primary"
            >
                {{ l }}
            </div>
        </div>
        <div>
            <q-btn
                class="q-mr-sm"
                type="a"
                :to="{ name: 'magic/search', query: { q: `s:${id}` }}"
                target="_blank"
                icon="mdi-cards-outline"
                flat round dense
            />

            {{ cardCount }}
        </div>
    </q-page>
</template>

<style lang="sass" scoped>
.name
    @media (max-width: 599px)
        font-size: 150%

    @media (min-width: 600px)
        font-size: 200%

.rarities, .langs
    display: flex

    @media (max-width: 599px)
        justify-content: center

    @media (min-width: 600px)
        justify-content: start

.rarity
    width: 80px

    & > img
        width: 50px

.lang
    margin-right: 2px

    font-size: 10px
</style>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';

import { useRoute } from 'vue-router';
import { useStore } from 'src/store';

import basicSetup from 'setup/basic';
import pageSetup from 'setup/page';

import { apiGet, apiBase, imageBase } from 'boot/backend';

interface SetLocalization {
    name?: string,
    isOfficialName: boolean,
    link?: string,
}

interface Set {
    setId: string,

    block?: string,
    parent?: string,

    printedSize?: number,
    cardCount: number,
    langs: string[],
    rarities: string[],

    localization: Record<string, SetLocalization>,

    setType: string,
    isDigital: boolean,
    isFoilOnly: boolean,
    isNonfoilOnly: boolean,
    symbolStyle: string[],

    releaseDate?: string,

    scryfall: {
        id: string,
        code: string,
    },

    mtgoCode?: string,
    tcgplayerId?: number,
}

export default defineComponent({
    setup() {
        const route = useRoute();
        const store = useStore();

        const { isAdmin } = basicSetup();

        const data = ref<Set|null>(null);

        const id = computed(() => route.params.id as string);

        const name = computed(() => {
            if (data.value == null) {
                return;
            }

            return data.value.localization[store.getters['magic/locale']]?.name ??
                 data.value.localization[store.getters['magic/locales'][0]]?.name;
        });

        pageSetup({
            title: () => name.value ?? id.value,
        });

        const parent = computed(() => data.value?.parent);

        const cardCount = computed(() => data.value?.cardCount ?? 0);
        const langs = computed(() => data.value?.langs ?? []);
        const rarities = computed(() => data.value?.rarities ?? []);

        const setType = computed(() => data.value?.setType);

        const wotcLink = computed(() => {
            if (data.value == null) {
                return;
            }

            return data.value.localization[store.getters['magic/locale']]?.link ??
                 data.value.localization[store.getters['magic/locales'][0]]?.link;
        });

        const apiLink = computed(() => `http://${apiBase}/magic/set?id=${id.value}`);
        const editorLink = computed(() => ({ name: 'magic/data', query: { tab: 'Set', id: id.value } }));

        const loadData = async () => {
            const { data: result } = await apiGet<Set>('/magic/set', {
                id: id.value,
            });

            data.value = result;
        };

        const iconUrl = (rarity: string) => {
            if (
                parent.value != null && setType.value != null &&
                ['promo', 'token', 'memorabilia', 'funny'].includes(setType.value)
            ) {
                return `http://${imageBase}/magic/set/icon?auto-adjust&set=${parent.value}&rarity=${rarity}`;
            }

            return `http://${imageBase}/magic/set/icon?auto-adjust&set=${id.value}&rarity=${rarity}`;
        };

        watch(() => id.value, loadData, { immediate: true });

        return {
            isAdmin,

            id,
            name,
            cardCount,
            langs,
            rarities,

            wotcLink,
            apiLink,
            editorLink,

            iconUrl,
        };
    },
});
</script>
