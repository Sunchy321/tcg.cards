<template>
    <q-layout view="hHh Lpr fFf">
        <q-header elevated>
            <q-toolbar>
                <q-btn
                    flat
                    dense
                    round
                    @click="leftDrawerOpen = !leftDrawerOpen"
                    icon="menu"
                    aria-label="Menu"
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
            </q-toolbar>
        </q-header>

        <q-page-container>
            <q-ajax-bar />
            <router-view />

            <div class="footer">
                <div v-if="enableControl" style="padding: 12px">
                    <router-link
                        v-for="p in controlPages[game] || []"
                        :key="p.id"
                        :to="p.path"
                    >
                        {{ $t(p.title) }}
                    </router-link>
                </div>
            </div>
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

    data() {
        return {
            leftDrawerOpen: false
        };
    },

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

        enableControl() {
            return this.$store.getters.enableControl;
        },

        title() {
            const path = this.$route.path;

            if (path === '' || path === '/') {
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

        controlPages() {
            const pages = { };

            for (const g in this.pages) {
                pages[g] = [];

                for (const p of this.pages[g]) {
                    if (p.isControl) {
                        pages[g].push({
                            path:  p.path,
                            title: p.title
                        });
                    }
                }
            }

            return pages;
        }
    }
};
</script>
