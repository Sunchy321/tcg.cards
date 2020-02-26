<template>
    <q-layout view="lHh Lpr lFf">
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
                    {{ title}}
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

        <q-drawer
            v-model="leftDrawerOpen"
            bordered
            content-class="bg-grey-2"
        >
            <q-list>
                <q-item-label header>{{ $t('game.hearthstone') }}</q-item-label>

                <q-item clickable tag="router-link" to="/hearthstone/parse-log" >
                    <q-item-section>
                        {{ $t('title.hearthstone.parse-log') }}
                    </q-item-section>
                </q-item>
            </q-list>
        </q-drawer>

        <q-page-container>
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
        }
    }
};
</script>
