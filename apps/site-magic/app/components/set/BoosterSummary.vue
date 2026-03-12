<template>
  <div class="border border-black/20 dark:border-white/20 rounded-lg p-3">
    <!-- Header: name + detail link -->
    <div class="flex items-center gap-2 mb-3">
      <span class="font-medium text-sm flex-1">{{ boosterName }}</span>

      <!-- Pack selector if multiple packs -->
      <template v-if="packCount > 1">
        <!-- Ratio bar -->
        <div class="flex h-4 rounded overflow-hidden ring-1 ring-primary/50 w-24 shrink-0">
          <div
            v-for="(p, i) in booster.packs"
            :key="i"
            class="h-full transition-colors"
            :class="i === packIndex ? 'bg-primary' : 'bg-primary/20'"
            :style="{ width: `${(p.weight * 100) / booster.totalWeight}%` }"
            @click="packIndex = i"
          />
        </div>

        <!-- Pack ratio % -->
        <span class="text-xs text-gray-600 dark:text-gray-400 w-10 text-right shrink-0">{{ packRatio }}%</span>
      </template>

      <!-- Detail page link -->
      <NuxtLink :to="detailUrl">
        <UButton icon="lucide:info" variant="ghost" color="neutral" size="xs" />
      </NuxtLink>
    </div>

    <!-- Pack tab buttons if multiple packs -->
    <div v-if="packCount > 1" class="flex gap-1 mb-3">
      <button
        v-for="(_, i) in booster.packs"
        :key="i"
        class="px-2 py-0.5 text-xs rounded ring-1 transition-colors"
        :class="i === packIndex
          ? 'bg-primary text-white ring-primary'
          : 'ring-black/20 dark:ring-white/20 hover:bg-black/5 dark:hover:bg-white/5'"
        @click="packIndex = i"
      >
        {{ i + 1 }}
      </button>
    </div>

    <!-- Booster contents -->
    <div class="flex flex-wrap gap-3">
      <BoosterAvatar
        v-for="c in currentPack.contents"
        :key="c.type"
        :type="c.type"
        :count="c.count"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Booster } from '#model/magic/schema/set';

const props = defineProps<{
  setId:   string;
  booster: Booster;
}>();

const { t, te } = useI18n();

const packIndex = ref(0);
const packCount = computed(() => props.booster.packs.length);
const currentPack = computed(() => props.booster.packs[packIndex.value]!);

const boosterName = computed(() => {
  const key = `magic.set.booster.name.${props.booster.boosterId}`;
  if (te(key)) return t(key);
  if (te(key, 'en')) return t(key, 'en' as any);
  return props.booster.boosterId;
});

const packRatio = computed(() => {
  const pack = currentPack.value;
  if (!pack) return 0;
  let rate = 10;
  do {
    const ratio = Math.round((pack.weight * rate * 100) / props.booster.totalWeight) / rate;
    if (ratio > 0) return ratio;
    rate *= 10;
  } while (rate < 1_000_000);
  return 0;
});

const detailUrl = computed(() => `/set/${props.setId}/booster/${props.booster.boosterId}`);
</script>
