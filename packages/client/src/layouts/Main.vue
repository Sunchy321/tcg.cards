<template>
    <q-layout view="hHh Lpr fFf">
        <q-header elevated>
            <q-toolbar>
                <q-toolbar-title>
                    {{ title }}
                </q-toolbar-title>

                <q-btn-dropdown
                    class="q-btn-locale"
                    dense flat
                    :label="locale"
                >
                    <q-list link>
                        <q-item
                            v-for="l in locales"
                            :key="l"
                            clickable
                            v-close-popup
                            @click="locale = l"
                        >
                            <q-item-section side>{{ l }}</q-item-section>
                            <q-item-section>{{ $t('lang.' + l) }}</q-item-section>
                        </q-item>
                    </q-list>
                </q-btn-dropdown>

                <q-btn
                    :icon="hasLoggedIn ? 'mdi-account-circle' : 'mdi-account-circle-outline'"
                    dense flat size="sm"
                    @click="toProfile"
                />
            </q-toolbar>
        </q-header>

        <q-page-container>
            <q-ajax-bar />
            <router-view />
        </q-page-container>
    </q-layout>
</template>

<style lang="stylus" scoped>

.q-btn-locale
    text-transform none !important

.footer
    background $primary
    color white

    padding 0 12px

</style>

<script>
import basic from '../mixins/basic';

export default {
    name: 'Main',

    mixins: [basic],

    computed: {
        locale: {
            get() {
                return this.$store.getters['locale/value'];
            },

            set(newValue) {
                this.$store.commit('locale/set', newValue);
            }
        },

        locales() {
            return this.$store.getters['locale/values'];
        },

        title() {
            const path = this.$route.path;

            if (path === '' || path === '/' || this.game == null) {
                return '';
            } else {
                const restPath = path.split('/').filter(v => v !== '').slice(1).join('/');

                if (restPath === '') {
                    return this.$t(`${this.game}.$self`);
                }

                for (const p of this.pages[this.game]) {
                    if (p.path === restPath) {
                        return this.$t(p.title);
                    }
                }

                return this.$t(`${this.game}.$title.${restPath.replace(/\//, '.')}`);
            }
        },

        pages() {
            const pages = {};

            for (const r of this.$router.options.routes) {
                if (r.path !== '/' && r.children != null) {
                    for (const c of r.children) {
                        const game = r.path.slice(1);
                        const path = c.path;

                        if (pages[game] == null) {
                            pages[game] = [];
                        }

                        pages[game].push({
                            isControl: path.startsWith('control/'),
                            path,
                            title:     `${game}.$title.${
                                path.replace(/\//g, '.').replace(/^control\./, '$control.')
                            }`
                        });
                    }
                }
            }

            return pages;
        },

        hasLoggedIn() {
            return this.$store.getters.profile != null;
        }
    },

    methods: {
        toProfile() {
            this.$router.push({ name: 'profile' });
        }
    }
};
</script>
