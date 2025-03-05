<template>
    <render />
</template>

<script setup lang="ts">
import {
    ref, computed, watch, h,
} from 'vue';

import { useRouter, RouterLink } from 'vue-router';
import { useHearthstone } from 'store/games/hearthstone';

import { QTooltip } from 'quasar';

import StatusIcon from 'components/hearthstone/StatusIcon.vue';
import CardImage from './CardImage.vue';

import { Adjustment } from 'interface/hearthstone/format-change';

import entityProfile, { EntityProfile } from 'src/common/hearthstone/entity';

type PartAdjustment = {
    part: string;
    status: Adjustment;
};

const props = withDefaults(defineProps<{
    cardId: string;
    status: Adjustment;
    format?: string;
    version: number;
    lastVersion: number;
    text?: string;
    adjustment: { id?: string, detail: PartAdjustment[] }[];
    showFull?: boolean;
}>(), {
    format:   undefined,
    text:     undefined,
    showFull: false,
});

const router = useRouter();
const hearthstone = useHearthstone();

const innerShowId = ref(false);
const profile = ref<EntityProfile>();

const link = computed(() => router.resolve({
    name:   'hearthstone/entity',
    params: { id: props.cardId },
    query:  {
        version: props.version,
    },
}).href);

const showId = computed(() => innerShowId.value || (profile.value == null && props.text == null));

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

const loadData = async () => entityProfile.get(
    props.cardId,
    v => { profile.value = v; },
).catch(() => { innerShowId.value = true; });

watch(() => props.cardId, loadData, { immediate: true });

const render = () => {
    const text = showId.value
        ? h('span', { class: 'code' }, props.cardId)
        : h('span', props.text ?? name.value ?? '');

    const images = props.adjustment.map(a => {
        if (a.detail.length === 0) {
            return h(CardImage, {
                class:   'adjustment-image',
                id:      a.id ?? props.cardId,
                version: props.version,
                variant: props.format === 'battlegrounds' ? 'battlegrounds' : 'normal',
            });
        } else {
            return h('span', { class: 'row items-center' }, [
                h(CardImage, {
                    class:   'adjustment-image',
                    id:      a.id ?? props.cardId,
                    version: props.lastVersion,
                    variant: props.format === 'battlegrounds' ? 'battlegrounds' : 'normal',
                }),
                h('img', { class: 'adjustment-arrow', src: '/hearthstone/right-arrow.png' }),
                h(CardImage, {
                    class:      'adjustment-image',
                    id:         a.id ?? props.cardId,
                    version:    props.version,
                    adjustment: a.detail,
                    variant:    props.format === 'battlegrounds' ? 'battlegrounds' : 'normal',
                }),
            ]);
        }
    });

    const div = h('div', { class: 'flex items-center flex-nowarp' }, images);

    if (props.showFull) {
        return h('div', { class: 'column items-center' }, [
            images,
            h(RouterLink, { to: link.value, target: '_blank' }, () => [
                h(StatusIcon, { status: props.status }),
                h('span', { class: 'q-ml-sm' }, text),
            ]),
        ]);
    } else {
        return h(RouterLink, {
            to:     link.value,
            target: '_blank',
        }, () => {
            const children = [
                h(StatusIcon, { status: props.status }),
                h('span', { class: 'q-ml-sm' }, text),
            ];

            if (profile.value != null) {
                children.push(h(QTooltip, { 'content-class': 'adjustment-popover' }, () => [div]));
            }

            return children;
        });
    }
};
</script>

<style lang="sass">
.adjustment-popover, [content-class=adjustment-popover]
    background-color: transparent !important
    padding: 0 !important

.adjustment-image
    width: 150px

.adjustment-arrow
    width: 30px
</style>
