<template>
    <div>
        <router-link :to="link" target="_blank">
            <span v-if="name != null">{{ name }}</span>
            <span v-else class="code">{{ id }}</span>
            <q-tooltip v-if="imageVersion != null" content-class="card-popover">
                <card-image
                    class="card-image"
                    :lang="imageVersion.lang"
                    :set="imageVersion.set"
                    :number="imageVersion.number"
                    :layout="profile.layout"
                />
            </q-tooltip>
        </router-link>
    </div>
</template>

<style lang="stylus">

.card-popover
    background-color transparent !important
    padding 0 !important

.card-image
    width 250px

</style>

<script>
import { getProfile } from 'src/common/magic/card';

import CardImage from './CardImage';

export default {
    components: { CardImage },

    props: {
        id: {
            type:     String,
            required: true,
        },

        pauper: {
            type:    Boolean,
            default: false,
        },
    },

    data: () => ({
        profile: null,
    }),

    computed: {
        link() {
            return '/magic/card/' + this.id;
        },

        name() {
            if (this.profile == null) {
                return null;
            }

            const locales = this.$store.getters['magic/locales'];

            const locale = this.$store.getters['magic/locale'];
            const defauleLocale = locales[0];

            return this.profile.parts.map(p =>
                p.localization.find(l => l.lang === locale)?.name ??
                p.localization.find(l => l.lang === defauleLocale)?.name ?? '',
            ).join(' // ');
        },

        imageVersion() {
            if (this.profile == null || this.profile.versions == null) {
                return null;
            }

            if (this.pauper) {
                const versions = this.profile.versions.filter(v => v.rarity === 'common');

                const locales = this.$store.getters['magic/locales'];

                const locale = this.$store.getters['magic/locale'];
                const defauleLocale = locales[0];

                const localeVersion = versions.filter(v => v.lang === locale);

                if (localeVersion.length > 0) {
                    return localeVersion.sort((a, b) =>
                        a.releaseDate > b.releaseDate ? -1
                            : a.releaseDate < b.releaseDate ? 1 : 0,
                    )[0];
                }

                const defaultVersion = versions.filter(v => v.lang === defauleLocale);

                if (defaultVersion.length > 0) {
                    return defaultVersion.sort((a, b) =>
                        a.releaseDate > b.releaseDate ? -1
                            : a.releaseDate < b.releaseDate ? 1 : 0,
                    )[0];
                }

                if (versions.length > 0) {
                    return versions.sort((a, b) =>
                        a.releaseDate > b.releaseDate ? -1
                            : a.releaseDate < b.releaseDate ? 1 : 0,
                    )[0];
                }
            }

            const versions = this.profile.versions;

            const locales = this.$store.getters['magic/locales'];

            const locale = this.$store.getters['magic/locale'];
            const defauleLocale = locales[0];

            const localeVersion = versions.filter(v => v.lang === locale);

            if (localeVersion.length > 0) {
                return localeVersion.sort((a, b) =>
                    a.releaseDate > b.releaseDate ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0,
                )[0];
            }

            const defaultVersion = versions.filter(v => v.lang === defauleLocale);

            if (defaultVersion.length > 0) {
                return defaultVersion.sort((a, b) =>
                    a.releaseDate > b.releaseDate ? -1
                        : a.releaseDate < b.releaseDate ? 1 : 0,
                )[0];
            }

            return versions.slice().sort((a, b) =>
                a.releaseDate > b.releaseDate ? -1
                    : a.releaseDate < b.releaseDate ? 1 : 0,
            )[0];
        },
    },

    watch: {
        id: {
            immediate: true,
            handler() {
                this.loadData();
            },
        },
    },

    methods: {
        async loadData() {
            const { local, remote } = getProfile(this.id);

            const localData = await local;

            this.profile = localData;

            const remoteData = await remote;

            this.profile = remoteData;
        },

    },
};
</script>
