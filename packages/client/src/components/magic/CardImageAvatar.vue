<template>
    <render />
</template>

<script setup lang="ts">
import {
    ref, computed, watch, h,
} from 'vue';

import { useRouter, RouterLink } from 'vue-router';
import { useMagic } from 'store/games/magic';

import CardImage from './CardImage.vue';

import cardProfile, { CardProfile } from 'src/common/magic/card';

import { pick } from 'lodash';

type Version = {
    set:    string;
    number: string;
    lang?:  string;
};

const props = withDefaults(defineProps<{
    cardId:   string;
    part?:    number;
    version?: Version;
    useLang?: boolean;
    pauper?:  boolean;
    text?:    string;
}>(), {
    part:    undefined,
    version: undefined,
    useLang: false,
    pauper:  false,
    text:    undefined,
});

const router = useRouter();
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
    params: { id: props.cardId },
    query:  {
        ...pick(props.version, ['set', 'number', 'lang']),
        ...props.part != null ? { part: props.part } : {},
    },
}).href);

const imageVersion = computed(() => {
    if (profile.value == null || profile.value.versions == null) {
        return null;
    }

    const versions = [
        // filter for version
        (vs: CardProfile['versions']) => {
            if (props.version != null) {
                const target = props.version;

                if (target.lang != null) {
                    return vs.filter(v => v.set === target.set && v.number === target.number && v.lang === target.lang);
                } else {
                    return vs.filter(v => v.set === target.set && v.number === target.number);
                }
            } else {
                return vs;
            }
        },

        // filter for pauper
        (vs: CardProfile['versions']) => {
            if (props.pauper) {
                return vs.filter(v => v.rarity === 'common');
            } else {
                return vs;
            }
        },

        // filter for locale
        (vs: CardProfile['versions']) => {
            const { locales } = magic;
            const defaultLocale = locales[0];

            const localeVersion = vs.filter(v => v.lang === locale.value);

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
    props.cardId,
    v => { profile.value = v; },
).catch(() => { innerShowId.value = true; });

watch(() => props.cardId, loadData, { immediate: true });

const render = () => h(RouterLink, {
    to:     link.value,
    target: '_blank',
}, () => {
    if (profile.value == null || imageVersion.value == null) {
        return [];
    }

    return [h(CardImage, {
        class:  'card-image-avatar',
        lang:   imageVersion.value.lang,
        set:    imageVersion.value.set,
        number: imageVersion.value.number,
        layout: imageVersion.value.layout,
        part:   props.part,
    })];
});
</script>

<style lang="sass">
.card-image-avatar
    width: 250px
</style>
