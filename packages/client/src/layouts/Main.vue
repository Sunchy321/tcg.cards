<template>
    <q-layout view="hHh Lpr fFf">
        <q-header elevated>
            <q-toolbar>
                <q-btn icon="mdi-home" flat dense round @click="toHome" />

                <app-title />

                <q-btn-dropdown
                    v-if="game != null"
                    flat dense
                    :label="gameLocale"
                >
                    <q-list link style="width: 150px">
                        <q-item
                            v-for="l in gameLocales" :key="l"
                            v-close-popup

                            clickable
                            @click="gameLocale = l"
                        >
                            <q-item-section side class="code">
                                {{ l }}
                            </q-item-section>
                            <q-item-section no-wrap>
                                {{ $t('lang.' + l) }}
                            </q-item-section>
                        </q-item>
                    </q-list>
                </q-btn-dropdown>

                <q-btn
                    v-for="b in buttons" :key="b.event"
                    :icon="b.icon"
                    flat dense round
                    @click="$store.commit('event', b.event)"
                />

                <q-btn
                    v-if="isAdmin && game != null"
                    icon="mdi-database"
                    flat dense round
                    @click="toData"
                />

                <q-btn
                    :icon="user != null ? 'mdi-cog' : 'mdi-cog-outline'"
                    flat dense round
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
.code
    color #777
    width 40px
</style>

<script>
import basic from '../mixins/basic';

import AppTitle from 'components/Title';

export default {
    name: 'Main',

    components: { AppTitle },

    mixins: [basic],

    computed: {
        buttons() {
            const buttons = [];

            for (const r of this.$route.matched) {
                if (r.meta.button != null) {
                    buttons.push(...r.meta.button);
                }
            }

            return buttons;
        },

        gameLocale: {
            get() {
                if (this.game != null) {
                    return this.$store.getters[`${this.game}/locale`];
                } else {
                    return null;
                }
            },

            set(newValue) {
                this.$store.commit(`${this.game}/locale`, newValue);
            },
        },

        gameLocales() {
            if (this.game != null) {
                return this.$store.getters[`${this.game}/locales`];
            } else {
                return [];
            }
        },

        dataPath() {
            if (this.isAdmin && this.game != null) {
                return `/${this.game}/data`;
            } else {
                return null;
            }
        },
    },

    methods: {
        toHome() {
            if (this.game && this.$route.path !== '/' + this.game) {
                this.$router.push('/' + this.game);
            } else {
                this.$router.push('/');
            }
        },

        toData() {
            if (this.game != null) {
                this.$router.push(`/${this.game}/data`);
            }
        },

        toSetting() {
            this.$router.push('/setting');
        },
    },
};
</script>
