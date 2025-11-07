<template>
    <render />
</template>

<script setup lang="ts">
import {
    ref, computed, watch, h,
} from 'vue';

import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useGame } from 'store/games/lorcana';

import setProfile, { SetProfile } from 'src/common/lorcana/set';

const props = defineProps<{
    setId: string;
    text?: string;
}>();

const router = useRouter();
const route = useRoute();
const game = useGame();

const innerShowId = ref(false);
const profile = ref<SetProfile | null>(null);

const link = computed(() => router.resolve({
    name:   'lorcana/set',
    params: { id: props.setId },
}).href);

const onThisPage = computed(() => link.value === route.path);

const name = computed(() => {
    if (profile.value == null) {
        return null;
    }

    const { locales, locale } = game;
    const defaultLocale = locales[0];

    const { localization } = profile.value;

    return localization[locale]?.name ?? localization[defaultLocale]?.name ?? props.setId;
});

const loadData = async () => setProfile.get(
    props.setId,
    v => { profile.value = v; },
).catch(() => { innerShowId.value = true; });

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
