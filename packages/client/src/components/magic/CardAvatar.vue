<template>
    <div>
        <router-link :to="link" target="_blank">
            <span v-if="name != null">{{ name }}</span>
            <span v-else class="code">{{ id }}</span>
        </router-link>
    </div>
</template>

<style>

</style>

<script>
import { getProfile } from 'src/common/magic/card';

export default {
    props: {
        id: {
            type:     String,
            required: true,
        },
    },

    data() {
        return {
            profile: null,
        };
    },

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
