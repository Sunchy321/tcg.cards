<template>
    <q-page class="q-pa-md">
        <q-inner-loading :showing="booster == null" />

        <div class="name">{{ name }}</div>
        <div class="summary q-mt-md">
            <div v-for="(p, i) in packs" :key="i" class="pack q-px-md q-py-sm">
                <div v-if="packs.length > 1" class="q-mb-sm">{{ packRatio(p) }}%</div>

                <div class="contents flex">
                    <BoosterAvatar v-for="c in p.contents" :key="c.type" :type="c.type" :count="c.count" />
                </div>
            </div>
        </div>
        <div class="sheets q-mt-md">
            <div v-for="s in sheets" :key="s.typeId">
                <q-btn
                    class="q-mb-sm"
                    flat dense no-caps
                    icon-right="mdi-menu-down"
                    @click="toggleSheet(s.typeId)"
                >
                    {{ localizeType(s.typeId) }} ({{ s.cards.length }})
                </q-btn>

                <div v-if="sheetsOpen[s.typeId] ?? false" class="sheet-cards">
                    <CardImageAvatar
                        v-for="c in s.cards" :key="c.cardId"
                        :card-id="c.cardId" :version="c.version"
                    />
                </div>
            </div>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useTitle } from 'store/core';
import { useGame } from 'store/games/magic';

import BoosterAvatar from './BoosterAvatar.vue';
import CardImageAvatar from 'components/magic/CardImageAvatar.vue';

import { Booster, Set as ISet } from '@interface/magic/set';

import setProfile from 'src/common/magic/set';
import { apiGet } from 'boot/server';

type Set = Omit<ISet, 'localization'> & {
    localization: Record<string, Omit<ISet['localization'][0], 'lang'>>;
};

const route = useRoute();
const i18n = useI18n();
const game = useGame();

const data = ref<Set | null>(null);

const setId = computed(() => route.params.setId as string);
const boosterId = computed(() => route.params.boosterId as string);

const booster = computed(() => data.value?.boosters?.find(b => b.boosterId === boosterId.value));

const setName = computed(() => {
    if (data.value == null) {
        return '';
    }

    return data.value.localization[game.locale]?.name
      ?? data.value.localization[game.locales[0]]?.name;
});

const name = computed(() => i18n.t(`magic.set.booster.name.${boosterId.value}`));

useTitle(() => setName.value ?? setId.value);

const packs = computed(() => booster.value?.packs ?? []);

const packRatio = (pack: Booster['packs'][0]) => {
    if (booster.value == null) {
        return 0;
    }

    let rate = 10;

    do {
        const ratio = Math.round((pack.weight * rate * 100) / booster.value.totalWeight) / rate;

        if (ratio > 0) {
            return ratio;
        }

        rate *= 10;
    } while (rate < 1000000000);

    return 0;
};

const sheets = computed(() => booster.value?.sheets ?? []);

const localizeType = (typeId: string) => {
    const key = `magic.set.booster.type.${typeId}`;

    if (i18n.te(key)) {
        return i18n.t(key);
    } else if (i18n.te(key, 'en')) {
        return i18n.t(key, 'en');
    } else {
        return typeId;
    }
};

const sheetsOpen = ref<Record<string, boolean>>({});

const toggleSheet = (typeId: string) => {
    sheetsOpen.value[typeId] = !(sheetsOpen.value[typeId] ?? false);
};

const loadData = async () => {
    const { data: result } = await apiGet<Set>('/magic/set', {
        id: setId.value,
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

watch(() => setId.value, loadData, { immediate: true });

</script>

<style lang="sass" scoped>
.name
    @media (max-width: 599px)
        font-size: 150%

    @media (min-width: 600px)
        font-size: 200%

.summary
    border: 1px solid black
    border-radius: 5px

.pack
    &:not(:last-child)
        border-bottom: 1px solid black

.contents
    gap: 8px

.sheet-cards
    display: grid
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr))
    gap: 8px

</style>
