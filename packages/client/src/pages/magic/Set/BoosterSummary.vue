<template>
    <div class="booster q-pa-sm">
        <div class="q-mb-sm flex items-center">
            <span class="q-mr-md">{{ $t(`magic.set.booster.name.${booster.boosterId}`) }}</span>
            <MultiToggle v-if="packCount > 1" v-model="packIndex" :total="booster.packs.length" />
            <q-space style="max-width: 100px;" />
            <span v-if="packCount > 1" class="q-mx-md">
                {{ `${packRatio}%` }}
            </span>
            <div v-if="packCount > 1" class="packs-ratio flex">
                <div
                    v-for="(p, i) in booster.packs" :key="i"
                    class="pack-ratio"
                    :class="{ selected: i === packIndex }"
                    :style="`width: ${p.weight * 100 / booster.totalWeight}%`"
                />
            </div>
            <q-space v-else />
            <router-link :to="detailUrl" class="q-ml-md">
                <q-btn icon="mdi-information-outline" flat round dense />
            </router-link>
        </div>
        <div class="booster-cards flex">
            <BoosterAvatar v-for="p in pack.contents" :key="p.type" :type="p.type" :count="p.count" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

import { useRouter, useRoute } from 'vue-router';

import BoosterAvatar from './BoosterAvatar.vue';
import MultiToggle from 'src/components/MultiToggle.vue';

import { Booster } from '@model/magic/schema/set';

const props = defineProps<{
    value: Booster;
}>();

const router = useRouter();
const route = useRoute();

const setId = computed(() => route.params.id);

const booster = computed(() => props.value);

const detailUrl = computed(() => router.resolve({
    name:   'magic/set/booster',
    params: { setId: setId.value, boosterId: booster.value.boosterId },
}).href);

const packIndex = ref(0);

const packCount = computed(() => booster.value.packs.length);

const pack = computed(() => booster.value.packs[packIndex.value]);

const packRatio = computed(() => {
    let rate = 10;

    do {
        const ratio = Math.round((pack.value.weight * rate * 100) / booster.value.totalWeight) / rate;

        if (ratio > 0) {
            return ratio;
        }

        rate *= 10;
    } while (rate < 100000);

    return 0;
});

</script>

<style lang="sass" scoped>
.booster
    border: 1px solid black
    border-radius: 5px

.packs-ratio
    height: 18px

    border: 1px solid $primary
    border-radius: 5px

    flex-grow: 1

.pack-ratio
    height: 100%
    &.selected
        background-color: $primary

.booster-cards
    gap: 8px

</style>
