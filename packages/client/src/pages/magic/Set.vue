<template>
    <q-page class="q-pa-md">
        <div class="flex items-center">
            <div class="name">{{ name }}</div>
            <q-space />
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
        <div>
            <div class="booster-title q-mt-lg">{{ $t('magic.ui.set.booster') }}</div>

            <booster v-for="b in boosters" :key="b.boosterId" :value="b" class="booster q-mt-md" />
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useRoute } from 'vue-router';
import { useGame } from 'store/games/magic';

import basicSetup from 'setup/basic';
import pageSetup from 'setup/page';

import Booster from './set/BoosterSummary.vue';

import { Set as ISet } from '@interface/magic/set';

import setProfile from 'src/common/magic/set';
import {
    apiGet, apiBase, assetBase,
} from 'boot/server';

type Set = Omit<ISet, 'localization'> & {
    localization: Record<string, Omit<ISet['localization'][0], 'lang'>>;
};

const route = useRoute();
const game = useGame();

const { isAdmin } = basicSetup();

const data = ref<Set | null>(null);

const id = computed(() => route.params.id as string);

const name = computed(() => {
    if (data.value == null) {
        return '';
    }

    return data.value.localization[game.locale]?.name
      ?? data.value.localization[game.locales[0]]?.name;
});

pageSetup({
    title: () => name.value ?? id.value,
});

const parent = computed(() => data.value?.parent);

const cardCount = computed(() => data.value?.cardCount ?? 0);
const langs = computed(() => data.value?.langs ?? []);
const rarities = computed(() => data.value?.rarities ?? []);

const type = computed(() => data.value?.type);

const wotcLink = computed(() => {
    if (data.value == null) {
        return '';
    }

    return data.value.localization[game.locale]?.link
      ?? data.value.localization[game.locales[0]]?.link;
});

const apiLink = computed(() => `${apiBase}/magic/set?id=${id.value}`);
const editorLink = computed(() => ({ name: 'magic/data', query: { tab: 'Set', id: id.value } }));

const boosters = computed(() => data.value?.boosters ?? []);

const loadData = async () => {
    const { data: result } = await apiGet<Set>('/magic/set', {
        id: id.value,
    });

    data.value = result;

    setProfile.update({
        setId:           result.setId,
        parent:          result.parent,
        localization:    result.localization,
        type:            result.type,
        symbolStyle:     result.symbolStyle,
        doubleFacedIcon: result.doubleFacedIcon,
        releaseDate:     result.releaseDate,
    });
};

const iconUrl = (rarity: string) => {
    if (
        parent.value != null && type.value != null
        && ['promo', 'token', 'memorabilia', 'funny'].includes(type.value)
    ) {
        return `${assetBase}/magic/set/icon/${parent.value}/${rarity}.svg`;
    }

    return `${assetBase}/magic/set/icon/${id.value}/${rarity}.svg`;
};

watch(() => id.value, loadData, { immediate: true });

</script>

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

.booster-title
    font-size: 120%
</style>
