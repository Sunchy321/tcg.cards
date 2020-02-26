<template>
    <q-layout view="hHh Lpr fFf">
        <q-header elevated>
            <q-toolbar>
                <q-toolbar-title>
                    {{ title }}
                </q-toolbar-title>

                <q-btn-dropdown
                    class="q-btn-loca

                    le"
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
        </q-page-container>
    </q-layout>
</template>

<script>
export default {
    name: 'Main',

    data() {
        return {
            leftDrawerOpen: false
        };
    },

    watch: {
        $route: {
            immediate: true,
            handler() {
                const path = this.$route.path;

                this.leftDrawerOpen = path === '' || path === '/';
            }
        }
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

        title() {
            const path = this.$route.path;
            if (path === '' || path === '/') {
                return this.$t('title.default');
            } else {
                return this.$t('title' + this.$route.path.replace(/\//g, '.'));
            }
        },

        pages() {
            const pages = {};

            for (const r of this.$router.options.routes) {
                if (r.path !== '/' && r.children != null) {
                    pages[r.path.slice(1)] = r.children.map(c => c.path);
                }
            }

            return pages;
        }
    }
};
</script>

<style lang="stylus" scoped>

.q-btn-locale
    text-transform none !important

</style>
