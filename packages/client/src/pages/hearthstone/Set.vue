<template>
    <q-page class="q-pa-md">
        <div class="flex items-center">
            <div class="name">{{ name }}</div>
            <q-space />
            <q-btn
                class="q-mr-sm"
                type="a"
                :href="apiLink"
                target="_blank"
                icon="mdi-code-json"
                flat round dense
            />
            <q-btn
                v-if="editorEnabled"
                :to="editorLink"
                icon="mdi-file-edit"
                flat round dense
            />
        </div>
        <div>
            <!-- <q-btn
                class="q-mr-sm"
                type="a"
                :to="{ name: 'hearthstone/search', query: { q: `s:${id}` }}"
                target="_blank"
                icon="mdi-cards-outline"
                flat round dense
            /> -->

            <!-- {{ cardCount }} -->
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useRoute } from 'vue-router';
import { useTitle } from 'store/core';
import { useGame } from 'store/games/hearthstone';

import { Set } from '@model/hearthstone/schema/set';

import setProfile from 'src/common/hearthstone/set';
import { apiBase } from 'boot/server';

import { auth, checkAdmin } from 'src/auth';
import { trpc } from 'src/trpc';

const route = useRoute();
const game = useGame();
const session = auth.useSession();

const editorEnabled = computed(() => {
    return checkAdmin(session.value, 'admin/magic');
});

const data = ref<Set>();

const id = computed(() => route.params.id as string);

const name = computed(() => {
    if (data.value == null) {
        return '';
    }

    return data.value.localization[game.locale]?.name
      ?? data.value.localization[game.locales[0]]?.name;
});

useTitle(() => name.value ?? id.value);

// const cardCount = computed(() => data.value?.cardCount ?? 0);

const apiLink = computed(() => `${apiBase}/hearthstone/set?id=${id.value}`);
const editorLink = computed(() => ({ name: 'hearthstone/data', query: { tab: 'Set', id: id.value } }));

const loadData = async () => {
    const result = await trpc.hearthstone.set.full({ setId: id.value });

    data.value = result;

    setProfile.update({
        setId:        result.setId,
        localization: result.localization,
        releaseDate:  result.releaseDate,
    });
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
</style>
