<template>
    <div class="card-embed" :class="`mode-${mode}`">
        <component
            :is="cardComponent"
            v-if="cardData"
            :id="cardId"
            :card-id="cardId"
            :version="cardData.version"
            :full-image="mode === 'image'"
        />
        <div v-else class="loading">
            <q-spinner />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { trpc } from 'src/trpc';

// Dynamic import card components
import MagicCardAvatar from '@/components/magic/CardAvatar.vue';
import YugiohCardAvatar from '@/components/yugioh/CardAvatar.vue';
import HearthstoneCardAvatar from '@/components/hearthstone/CardAvatar.vue';
import LorcanaCardAvatar from '@/components/lorcana/CardAvatar.vue';
import PtcgCardAvatar from '@/components/ptcg/CardAvatar.vue';

const props = defineProps<{
    cardId: string;
    game:   string;
    mode?:  'image' | 'text' | 'compact';
}>();

const mode = computed(() => props.mode || 'compact');

const cardData = ref<any>(null);

const cardComponent = computed(() => {
    const components: Record<string, any> = {
        magic:       MagicCardAvatar,
        yugioh:      YugiohCardAvatar,
        hearthstone: HearthstoneCardAvatar,
        lorcana:     LorcanaCardAvatar,
        ptcg:        PtcgCardAvatar,
    };

    return components[props.game];
});

const loadCard = async () => {
    try {
        // Call different API based on game type
        const gameApi = trpc[props.game as keyof typeof trpc];

        if (gameApi && 'card' in gameApi && 'profile' in (gameApi as any).card) {
            cardData.value = await (gameApi as any).card.profile(props.cardId);
        }
    } catch (error) {
        console.error('Failed to load card:', error);
    }
};

watch(() => props.cardId, loadCard, { immediate: true });
</script>

<style lang="sass" scoped>
.card-embed
    display: inline-block
    margin: 8px 0

    &.mode-compact
        max-width: 300px

    &.mode-image
        max-width: 400px

    &.mode-text
        width: 100%

    .loading
        display: flex
        justify-content: center
        align-items: center
        min-height: 100px
</style>
