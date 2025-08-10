<template>
    <render />
</template>

<script setup lang="ts">
import { ref, computed, watch, h } from 'vue';

import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useGame } from 'store/games/hearthstone';

import { QTooltip } from 'quasar';

import CardImage from './CardImage.vue';

import { CardProfile } from '@model/hearthstone/schema/card';

import { getValue, trpc } from 'src/hono';

const props = withDefaults(defineProps<{
    cardId:   string;
    format?:  string;
    version?: number;
    text?:    string;
}>(), {
    format:  undefined,
    version: 0,
    text:    undefined,
});

const router = useRouter();
const route = useRoute();
const game = useGame();

const innerShowId = ref(false);
const profile = ref<CardProfile>();

const link = computed(() => router.resolve({
    name:   'hearthstone/card',
    params: { id: props.cardId },
    query:  {
        version: props.version,
    },
}).href);

const showId = computed(() => innerShowId.value || (profile.value == null && props.text == null));
const onThisPage = computed(() => link.value === route.path);

const name = computed(() => {
    if (profile.value == null) {
        return null;
    }

    const { locales, locale } = game;
    const defaultLocale = locales[0];

    const localizations = profile.value.localization;

    const localization = localizations.find(l => l.lang === locale)
      ?? localizations.find(l => l.lang === defaultLocale)
      ?? localizations[0];

    return localization.name;
});

const loadData = async () => {
    if (profile.value != null && profile.value.cardId === props.cardId) {
        return;
    }

    const value = await getValue(trpc.hearthstone.card.profile, { cardId: props.cardId });

    if (value != null) {
        profile.value = value as CardProfile;
    }
};

watch(() => props.cardId, () => {
    loadData();
}, { immediate: true });

const render = () => {
    const text = showId.value
        ? h('span', { class: 'code' }, props.cardId)
        : h('span', props.text ?? name.value ?? '');

    if (onThisPage.value) {
        return text;
    } else {
        return h(RouterLink, {
            to:     link.value,
            target: '_blank',
        }, () => {
            const children = [text];

            if (profile.value != null) {
                children.push(h(QTooltip, {
                    'content-class': 'card-popover',
                }, () => [h(CardImage, {
                    class:   'card-image-popover',
                    id:      props.cardId,
                    version: props.version,
                    variant: props.format === 'battlegrounds' ? 'battlegrounds' : 'normal',
                })]));
            }

            return children;
        });
    }
};

</script>

<style lang="sass">
.card-popover, [content-class=card-popover]
    background-color: transparent !important
    padding: 0 !important

.card-image-popover
    width: 250px
</style>
