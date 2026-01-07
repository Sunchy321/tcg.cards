<template>
    <q-page>
        <div>
            <search-input
                v-model="searchText"
                class="main-input q-ma-xl"
                filled clearable
                :error="explained.type === 'error'"
                @keypress.enter="search"
            >
                <template #append>
                    <q-btn
                        icon="mdi-magnify"
                        flat dense round
                        @click="search"
                    />
                </template>
                <template #hint>
                    <div>{{ explained.text }}</div>
                </template>
                <template #error>
                    <div>{{ explained.text }}</div>
                </template>
            </search-input>
        </div>

        <div class="main q-pa-md">
            <q-btn
                v-for="g in games"
                :key="g"
                :to="`/${g}`"
                no-caps
                outline
                class="tcg-item"
            >
                <div class="tcg-item-card">
                    <q-img class="tcg-icon" :src="`${g}/logo.svg`" />
                    <span class="tcg-label">{{ fullName(g) }}</span>
                </div>
            </q-btn>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useI18n } from 'vue-i18n';
import { useCore, useTitle } from 'store/core';

import omnisearchSetup from 'src/setup/omnisearch';

import SearchInput from 'components/SearchInput.vue';

import { games } from '@interface/index';

import { explain as model } from 'src/search/data/omnisearch';

const core = useCore();
const i18n = useI18n();

const { search } = omnisearchSetup();

useTitle('TCG Card Database');

const searchText = computed({
    get() { return core.search; },
    set(newValue: string) { core.search = newValue; },
});

const explained = computed(() => model.explain(searchText.value, (key: string, named) => {
    let realKey;

    if (key.startsWith('$.')) {
        realKey = `magic.search.${key.slice(2)}`;
    } else {
        realKey = `search.${key}`;
    }

    if (named != null) {
        return i18n.t(realKey, named);
    } else {
        return i18n.t(realKey);
    }
}));

const fullName = (g: string) => {
    if (i18n.te(`${g}.$selfFull`)) {
        return i18n.t(`${g}.$selfFull`);
    } else {
        return i18n.t(`${g}.$self`);
    }
};

</script>

<style lang="sass" scoped>
@media (max-width: 599px)
    .main
        display: flex
        flex-direction: column
        justify-content: start

    .tcg-item
        width: 100%
        margin: 8px

    .tcg-item-card
        width: 100%
        height: 100%

        display: flex
        justify-content: start
        align-items: center

    .tcg-icon
        width: 40px
        height: 40px

    .tcg-label
        margin-left: 10px

@media (min-width: 600px)
    .main
        display: flex
        justify-content: center

    .tcg-item
        width: 200px
        height: 250px
        margin: 8px

    .tcg-item-card
        width: 100%
        height: 100%

        display: flex
        flex-direction: column
        justify-content: space-around
        align-items: center

        padding-top: 30px
        padding-bottom: 30px

    .tcg-icon
        width: 60%
        height: 60%
</style>
