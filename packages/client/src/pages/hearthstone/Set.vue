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
                v-if="isAdmin"
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

<script lang="ts">
import {
    defineComponent, ref, computed, watch,
} from 'vue';

import { useRoute } from 'vue-router';
import { useGame } from 'store/games/hearthstone';

import basicSetup from 'setup/basic';
import pageSetup from 'setup/page';

import { Set as ISet } from '@interface/hearthstone/set';

import setProfile from 'src/common/hearthstone/set';
import { apiGet, apiBase } from 'boot/server';

type Set = Omit<ISet, 'localization'> & {
    localization: Record<string, Omit<ISet['localization'][0], 'lang'>>;
};

export default defineComponent({
    setup() {
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

        // const cardCount = computed(() => data.value?.cardCount ?? 0);

        const apiLink = computed(() => `${apiBase}/hearthstone/set?id=${id.value}`);
        const editorLink = computed(() => ({ name: 'hearthstone/data', query: { tab: 'Set', id: id.value } }));

        const loadData = async () => {
            const { data: result } = await apiGet<Set>('/hearthstone/set', {
                id: id.value,
            });

            data.value = result;

            setProfile.update({
                setId:        result.setId,
                localization: result.localization,
                releaseDate:  result.releaseDate,
            });
        };

        watch(() => id.value, loadData, { immediate: true });

        return {
            isAdmin,

            name,

            apiLink,
            editorLink,
        };
    },
});
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
