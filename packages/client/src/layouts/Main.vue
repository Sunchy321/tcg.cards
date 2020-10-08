<template>
    <q-layout view="hHh Lpr fFf">
        <q-header elevated>
            <q-toolbar>
                <q-btn
                    icon="mdi-home"
                    flat dense
                    @click="toHome"
                />

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
                    :icon="loggedIn ? 'mdi-cog' : 'mdi-cog-outline'"
                    flat dense
                    @click="toSetting"
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

</style>

<script>
import basic from '../mixins/basic';

import { format } from 'quasar';

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
            const titleMatch = this.$route.matched.find(r => r.meta.title != null);

            if (titleMatch != null) {
                return format.capitalize(this.$t(titleMatch.meta.title));
            } else {
                return this.$route.path.slice(1).replace(/\//g, '.');
            }
        }
    },

    methods: {
        toHome() {
            if (this.game && this.$route.path !== '/' + this.game) {
                this.$router.push('/' + this.game);
            } else {
                this.$router.push('/');
            }
        },

        toSetting() {
            const path = encodeURIComponent(this.$route.path.slice(1));

            if (path === '') {
                this.$router.push('/setting');
            } else {
                this.$router.push('/setting?redirect');
            }
        }
    }
};
</script>
