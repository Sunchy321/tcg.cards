<template>
    <div>
        <router-link :to="link" target="_blank">
            <span v-if="name != null">{{ name }}</span>
            <span v-else class="code">{{ id }}</span>
            <q-tooltip
                v-if="profile != null && imageVersion != null"
                content-class="card-popover"
            >
                <card-image
                    class="card-image-popover"
                    :lang="imageVersion.lang"
                    :set="imageVersion.set"
                    :number="imageVersion.number"
                    :layout="profile.layout"
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
import { defineComponent, ref, computed, watch } from 'vue';

import { useStore } from 'src/store';

import CardImage from './CardImage.vue';

import { CardProfile, getProfile } from 'src/common/magic/card';

export default defineComponent({
    components: { CardImage },

    props: {
        id:     { type: String, required: true },
        pauper: { type: Boolean, default: false },
    },

    setup(props) {
        const store = useStore();

        const profile = ref<CardProfile|null>(null);

        const link = computed(() => {
            return '/magic/card/' + props.id;
        });

        const name = computed(() => {
            if (profile.value == null) {
                return null;
            }

            const locales = store.getters['magic/locales'];
            const locale = store.getters['magic/locale'];
            const defauleLocale = locales[0];

            return profile.value.parts.map(p =>
                p.localization.find(l => l.lang === locale)?.name ??
                p.localization.find(l => l.lang === defauleLocale)?.name ?? '',
            ).join(' // ');
        });

        const imageVersion = computed(() => {
            if (profile.value == null || profile.value.versions == null) {
                return null;
            }

            if (props.pauper) {
                const versions = profile.value.versions.filter(v => v.rarity === 'common');

                const locales = store.getters['magic/locales'];
                const locale = store.getters['magic/locale'];
                const defauleLocale = locales[0];

                const localeVersion = versions.filter(v => v.lang === locale);

                if (localeVersion.length > 0) {
                    return localeVersion.sort((a, b) =>
                        a.releaseDate > b.releaseDate
                            ? -1
                            : a.releaseDate < b.releaseDate ? 1 : 0,
                    )[0];
                }

                const defaultVersion = versions.filter(v => v.lang === defauleLocale);

                if (defaultVersion.length > 0) {
                    return defaultVersion.sort((a, b) =>
                        a.releaseDate > b.releaseDate
                            ? -1
                            : a.releaseDate < b.releaseDate ? 1 : 0,
                    )[0];
                }

                if (versions.length > 0) {
                    return versions.sort((a, b) =>
                        a.releaseDate > b.releaseDate
                            ? -1
                            : a.releaseDate < b.releaseDate ? 1 : 0,
                    )[0];
                }
            }

            const versions = profile.value.versions;

            const locales = store.getters['magic/locales'];
            const locale = store.getters['magic/locale'];
            const defauleLocale = locales[0];

            const localeVersion = versions.filter(v => v.lang === locale);

            if (localeVersion.length > 0) {
                return localeVersion.sort((a, b) =>
                    a.releaseDate > b.releaseDate
                        ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0,
                )[0];
            }

            const defaultVersion = versions.filter(v => v.lang === defauleLocale);

            if (defaultVersion.length > 0) {
                return defaultVersion.sort((a, b) =>
                    a.releaseDate > b.releaseDate
                        ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0,
                )[0];
            }

            return versions.slice().sort((a, b) =>
                a.releaseDate > b.releaseDate
                    ? -1
                    : a.releaseDate < b.releaseDate ? 1 : 0,
            )[0];
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
        };

        watch(() => props.id, loadData, { immediate: true });

        return {
            profile,
            name,
            link,
            imageVersion,
        };
    },
});
</script>
