<template>
    <render />
</template>

<script setup lang="ts">
import { ref, computed, watch, h } from 'vue';

import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useGame } from 'store/games/magic';

import { SetProfile } from '@model/magic/schema/set';

import { getValue, trpc } from 'src/hono';

const props = withDefaults(defineProps<{
    setId: string;
    text?: string;
}>(), {
    text: undefined,
});

const router = useRouter();
const route = useRoute();
const game = useGame();

const innerShowId = ref(false);
const profile = ref<SetProfile>();

const link = computed(() => router.resolve({
    name:   'magic/set',
    params: { id: props.setId },
}).href);

const onThisPage = computed(() => link.value === route.path);

const name = computed(() => {
    if (profile.value == null) {
        return null;
    }

    const { locales, locale } = game;
    const defaultLocale = locales[0];

    const localization = profile.value.localization.find(l => l.lang === locale)
      ?? profile.value.localization.find(l => l.lang === defaultLocale);

    return localization?.name ?? props.setId;
});

const loadData = async () => {
    const value = await getValue(trpc.magic.set.profile, { setId: props.setId });

    if (value != null) {
        profile.value = value;
        innerShowId.value = false;
    } else {
        innerShowId.value = true;
    }
};

watch(() => props.setId, loadData, { immediate: true });

const render = () => {
    const text = props.text ?? name.value;

    const children = [h('span', { class: 'code set-id q-ml-sm' }, props.setId)];

    if (text != null) {
        const textSpan = h('span', text);

        if (onThisPage.value) {
            children.unshift(textSpan);
        } else {
            children.unshift(h(RouterLink, {
                to:     link.value,
                target: '_blank',
            }, () => [textSpan]));
        }
    }

    return h('div', children);
};

</script>

<style lang="sass" scoped>
.set-id
    color: #777

</style>
