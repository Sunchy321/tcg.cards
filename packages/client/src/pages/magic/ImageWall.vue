<template>
    <q-page>
        <q-img
            v-for="url in urls"
            :key="url"
            class="image"
            :src="url"
            :ratio="745/1040"
            native-context-menu
        >
            <template #error>
                <div class="card-not-found">
                    <q-img src="/magic/card-not-found.svg" :ratio="745/1040" />
                </div>
            </template>
        </q-img>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

import { useGame } from 'store/games/magic';
import { useI18n } from 'vue-i18n';
import { useParam, useTitle } from 'store/core';

import { assetBase, apiGet } from 'boot/server';

const game = useGame();
const i18n = useI18n();

useTitle(() => i18n.t('magic.image-wall'));

const set = useParam('set', {
    type:     'string',
    bind:     'query',
    readonly: true,
});

const lang = useParam('lang', {
    type:     'string',
    bind:     'query',
    readonly: true,
    default:  () => game.locale,
});

const type = useParam('type', {
    type:     'enum',
    bind:     'query',
    values:   ['png'],
    readonly: true,
});

const data = ref<string[]>([]);

const urls = computed(() => data.value.map(name => {
    const [number, part] = name.split('-');

    if (part != null) {
        return `${assetBase}/magic/card/large/${set.value}/${lang.value}/${number}-${part}.jpg`;
    } else {
        return `${assetBase}/magic/card/large/${set.value}/${lang.value}/${number}.jpg`;
    }
}));

const loadData = async () => {
    const { data: result } = await apiGet<string[]>('/magic/set/image-all', {
        id:   set.value,
        lang: lang.value,
        type: type.value,
    });

    data.value = result;
};

onMounted(loadData);

</script>

<style lang="sass" scoped>
.image
    width: calc(100% / 8)
</style>
