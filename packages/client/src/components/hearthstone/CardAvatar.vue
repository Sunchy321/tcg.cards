<template>
    <render />
</template>

<script setup lang="ts">
import {
    ref, computed, watch, h,
    onMounted,
} from 'vue';

import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useHearthstone } from 'store/games/hearthstone';

import { QTooltip } from 'quasar';

import CardImage from './CardImage.vue';

import entityProfile, { EntityProfile } from 'src/common/hearthstone/entity';

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
const hearthstone = useHearthstone();

const innerShowId = ref(false);
const profile = ref<EntityProfile | null>(null);

const link = computed(() => router.resolve({
    name:   'hearthstone/entity',
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

    const { locales, locale } = hearthstone;
    const defaultLocale = locales[0];

    const localizations = profile.value.localization;

    const localization = localizations.find(l => l.lang === locale)
      ?? localizations.find(l => l.lang === defaultLocale)
      ?? localizations[0];

    return localization.name;
});

const quickLoadData = async () => {
    const value = await entityProfile.getLocal(props.cardId);

    if (value != null) {
        profile.value = value;
    }
};

onMounted(quickLoadData);

const loadData = async () => {
    if (profile.value != null && profile.value.cardId === props.cardId) {
        return;
    }

    entityProfile.get(props.cardId, v => profile.value = v).catch(() => innerShowId.value = true);
};

watch(() => props.cardId, (newValue, oldValue) => {
    if (newValue != null && oldValue != null) {
        loadData();
    }
});

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
