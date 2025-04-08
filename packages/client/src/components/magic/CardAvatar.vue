<template>
    <render v-scroll-fire="loadData" />
</template>

<script setup lang="ts">
import {
    ref, computed, watch, h,
} from 'vue';

import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useMagic } from 'store/games/magic';

import { QTooltip } from 'quasar';
import CardImage from './CardImage.vue';

import cardProfile, { CardProfile } from 'src/common/magic/card';

import { pick } from 'lodash';

type Version = {
    set?:    string;
    number?: string;
    lang:    string;
};

const props = withDefaults(
    defineProps<{
        id:         string;
        part?:      number;
        version?:   Version;
        useLang?:   boolean;
        pauper?:    'pauper' | 'pdh' | undefined;
        text?:      string;
        fullImage?: boolean;
    }>(),
    {
        part:      undefined,
        version:   undefined,
        useLang:   false,
        pauper:    undefined,
        text:      undefined,
        fullImage: false,
    },
);

const router = useRouter();
const route = useRoute();
const magic = useMagic();

const innerShowId = ref(false);
const profile = ref<CardProfile | null>(null);

const locale = computed(() => {
    if (props.useLang && props.version != null) {
        return props.version.lang;
    } else {
        return magic.locale;
    }
});

const link = computed(() => router.resolve({
    name:   'magic/card',
    params: { id: props.id },
    query:  {
        ...pick(props.version, ['set', 'number', 'lang']),
        ...props.part != null ? { part: props.part } : {},
    },
}).href);

const showId = computed(() => innerShowId.value || (profile.value == null && props.text == null));
const onThisPage = computed(() => link.value === route.path);

const name = computed(() => {
    if (profile.value == null) {
        return null;
    }

    const { locales } = magic;
    const defaultLocale = locales[0];

    return profile.value.parts.map(p => p.localization.find(l => l.lang === locale.value)?.name
      ?? p.localization.find(l => l.lang === defaultLocale)?.name ?? '').join(' // ');
});

const imageVersion = computed(() => {
    if (profile.value?.versions == null) {
        return null;
    }

    if (props.version?.set != null && props.version.number != null) {
        const matchedVersion = profile.value.versions.find(
            v => v.lang === props.version?.lang && v.set === props.version?.set && v.number === props.version.number,
        );

        if (matchedVersion != null) {
            return matchedVersion;
        }
    }

    const versions = [
        // filter for pauper
        (vs: CardProfile['versions']) => {
            if (props.pauper === 'pauper') {
                return vs.filter(v => v.rarity === 'common');
            } else if (props.pauper === 'pdh') {
                if (vs.some(v => v.rarity === 'common')) {
                    return vs.filter(v => v.rarity === 'common');
                } else {
                    return vs.filter(v => v.rarity === 'uncommon');
                }
            } else {
                return vs;
            }
        },

        // filter for locale
        (vs: CardProfile['versions']) => {
            const { locales } = magic;
            const defaultLocale = locales[0];

            const localeVersion = vs.filter(v => v.lang === (props.version?.lang ?? locale.value));

            if (localeVersion.length > 0) {
                return localeVersion;
            }

            const defaultVersion = vs.filter(v => v.lang === defaultLocale);

            if (defaultVersion.length > 0) {
                return defaultVersion;
            }

            return vs.slice();
        },
    ].reduce((value, func) => func(value), profile.value.versions);

    return versions.sort((a, b) => {
        if (a.releaseDate > b.releaseDate) {
            return -1;
        }

        if (a.releaseDate < b.releaseDate) {
            return 1;
        }

        const cmpNumber = ((a, b) => {
            const matchA = /^(\d+)(\w*)$/.exec(a.number);
            const matchB = /^(\d+)(\w*)$/.exec(b.number);

            if (matchA == null) {
                if (matchB == null) {
                    return a.number < b.number ? -1 : a.number > b.number ? 1 : 0;
                } else {
                    return 1;
                }
            } else if (matchB == null) {
                return -1;
            }

            const numA = Number.parseInt(matchA[1], 10);
            const numB = Number.parseInt(matchB[1], 10);

            return numA < numB
                ? -1
                : numA > numB
                    ? 1
                    : matchA[2] < matchB[2] ? -1 : matchA[2] > matchB[2] ? 1 : 0;
        })(a, b);

        if (cmpNumber !== 0) {
            return cmpNumber;
        }

        return 0;
    })[0];
});

const loadData = async () => cardProfile.get(
    props.id,
    v => { profile.value = v; },
).catch(() => { innerShowId.value = true; });

watch(() => props.id, (newValue, oldValue) => {
    if (newValue != null && oldValue != null) {
        loadData();
    }
});

const render = () => {
    const text = showId.value
        ? h('span', { class: 'code' }, props.id)
        : props.text != null
            ? h('span', props.text)
            : h('span', { lang: locale.value }, name.value ?? '');

    if (onThisPage.value) {
        return text;
    } else {
        if (props.fullImage) {
            const nodes = [];

            if (profile.value != null && imageVersion.value != null) {
                nodes.push(h(CardImage, {
                    lang:   imageVersion.value!.lang,
                    set:    imageVersion.value!.set,
                    number: imageVersion.value!.number,
                    layout: imageVersion.value!.layout,
                    part:   props.part,
                }));
            }

            const linkElem = h(RouterLink, {
                style:  { 'text-align': 'center' },
                to:     link.value,
                target: '_blank',
            }, () => [text]);

            nodes.push(h('div', { class: 'flex justify-center' }, [linkElem]));

            return h('div', null, nodes);
        } else {
            return h(RouterLink, {
                to:     link.value,
                target: '_blank',
            }, () => {
                const children = [text];

                if (profile.value != null && imageVersion.value != null) {
                    children.push(h(QTooltip, {
                        'content-class': 'card-popover',
                    }, () => [h(CardImage, {
                        class:  'card-image-popover',
                        lang:   imageVersion.value!.lang,
                        set:    imageVersion.value!.set,
                        number: imageVersion.value!.number,
                        layout: imageVersion.value!.layout,
                        part:   props.part,
                    })]));
                }

                return children;
            });
        }
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
