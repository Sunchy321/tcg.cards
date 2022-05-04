<template>
    <div>
        <router-link :to="link" target="_blank">
            <span v-if="showId" class="code">{{ id }}</span>
            <span v-else>{{ text ?? name ?? '' }}</span>
            <q-tooltip
                v-if="profile != null && imageVersion != null && showTooltip"
                content-class="card-popover"
            >
                <card-image
                    class="card-image-popover"
                    :lang="imageVersion.lang"
                    :set="imageVersion.set"
                    :number="imageVersion.number"
                    :layout="imageVersion.layout"
                    :part="part"
                />
            </q-tooltip>
        </router-link>
    </div>
</template>

<style lang="sass">
.card-popover, [content-class=card-popover]
    background-color: transparent !important
    padding: 0 !important

.card-image-popover
    width: 250px
</style>

<script lang="ts">
/* eslint-disable prefer-destructuring */
import {
    defineComponent, ref, computed, watch, PropType,
} from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useMagic } from 'store/games/magic';

import CardImage from './CardImage.vue';

import { CardProfile, getProfile } from 'src/common/magic/card';

type Version = {
    set: string;
    number: string;
    lang: string;
};

export default defineComponent({
    components: { CardImage },

    props: {
        id:      { type: String, required: true },
        part:    { type: Number, default: undefined },
        version: { type: Object as PropType<Version>, default: undefined },
        pauper:  { type: Boolean, default: false },
        text:    { type: String, default: undefined },
    },

    setup(props) {
        const router = useRouter();
        const route = useRoute();
        const magic = useMagic();

        const innerShowId = ref(false);
        const profile = ref<CardProfile | null>(null);

        const link = computed(() => router.resolve({
            name:   'magic/card',
            params: { id: props.id },
            query:  {
                ...props.version,
                ...props.part != null ? { part: props.part } : {},
            },
        }).href);

        const showId = computed(() => innerShowId.value || (profile.value == null && props.text == null));
        const showTooltip = computed(() => link.value !== route.path);

        const name = computed(() => {
            if (profile.value == null) {
                return null;
            }

            const locales = magic.locales;
            const locale = magic.locale;
            const defaultLocale = locales[0];

            return profile.value.parts.map(p => p.localization.find(l => l.lang === locale)?.name
                ?? p.localization.find(l => l.lang === defaultLocale)?.name ?? '').join(' // ');
        });

        const imageVersion = computed(() => {
            if (profile.value == null || profile.value.versions == null) {
                return null;
            }

            if (props.version != null) {
                const matchedVersion = profile.value.versions.find(v => v.set === props.version?.set
                    && v.number === props.version?.number
                    && v.lang === props.version?.lang);

                if (matchedVersion != null) {
                    return matchedVersion;
                }
            }

            if (props.pauper) {
                const versions = profile.value.versions.filter(v => v.rarity === 'common');

                const locales = magic.locales;
                const locale = magic.locale;
                const defaultLocale = locales[0];

                const localeVersion = versions.filter(v => v.lang === locale);

                if (localeVersion.length > 0) {
                    return localeVersion.sort((a, b) => (a.releaseDate > b.releaseDate
                        ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0))[0];
                }

                const defaultVersion = versions.filter(v => v.lang === defaultLocale);

                if (defaultVersion.length > 0) {
                    return defaultVersion.sort((a, b) => (a.releaseDate > b.releaseDate
                        ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0))[0];
                }

                if (versions.length > 0) {
                    return versions.sort((a, b) => (a.releaseDate > b.releaseDate
                        ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0))[0];
                }
            }

            const { versions } = profile.value;

            const locales = magic.locales;
            const locale = magic.locale;
            const defaultLocale = locales[0];

            const localeVersion = versions.filter(v => v.lang === locale);

            if (localeVersion.length > 0) {
                return localeVersion.sort((a, b) => (a.releaseDate > b.releaseDate
                    ? -1
                    : a.releaseDate < b.releaseDate ? 1 : 0))[0];
            }

            const defaultVersion = versions.filter(v => v.lang === defaultLocale);

            if (defaultVersion.length > 0) {
                return defaultVersion.sort((a, b) => (a.releaseDate > b.releaseDate
                    ? -1
                    : a.releaseDate < b.releaseDate ? 1 : 0))[0];
            }

            return versions.slice().sort((a, b) => (a.releaseDate > b.releaseDate
                ? -1
                : a.releaseDate < b.releaseDate ? 1 : 0))[0];
        });

        const loadData = async () => {
            const { local, remote } = getProfile(props.id);

            const localData = await local;

            if (localData != null) {
                profile.value = localData;
            }

            const remoteData = await remote;

            if (remoteData != null) {
                profile.value = remoteData;
            }

            if (profile.value == null) {
                innerShowId.value = true;
            }
        };

        watch(() => props.id, loadData, { immediate: true });

        return {
            showId,
            profile,
            name,
            link,
            showTooltip,
            imageVersion,
        };
    },
});
</script>
