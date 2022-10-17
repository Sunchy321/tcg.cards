<template>
    <q-layout view="hHh Lpr fFf">
        <app-header v-model:drawer-open="drawerOpen" />

        <q-drawer v-model="drawerOpen" show-if-above class="q-pa-md">
            <component :is="user == null ? 'user-login' : 'user-profile'" />

            <q-tabs v-model="tab" class="left-tabs" vertical>
                <q-tab name="basic" :label="$t('setting.basic')" />
                <q-tab
                    v-for="g in games" :key="g"
                    :name="g" :label="$t(`${g}.$self`)"
                />
            </q-tabs>
        </q-drawer>

        <q-page-container>
            <q-ajax-bar />
            <router-view ref="main" />
        </q-page-container>
    </q-layout>
</template>

<style lang="sass">

.left-tabs
    height: unset

</style>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { useCore } from 'store/core';

import basicSetup from 'setup/basic';
import pageSetup from 'setup/page';

import UserLogin from 'components/setting/Login.vue';
import UserProfile from 'components/setting/Profile.vue';

import AppHeader from 'components/Header.vue';

export interface Menu {
    id: string;
    label: string;
    children?: Menu[];
}

export default defineComponent({
    components: { AppHeader, UserLogin, UserProfile },

    setup() {
        const i18n = useI18n();
        const router = useRouter();
        const route = useRoute();
        const core = useCore();

        const { games, user } = basicSetup();

        pageSetup({
            title: () => i18n.t('setting.$self'),
        });

        const drawerOpen = ref(false);

        const tab = computed({
            get() {
                const name = route.name?.toString();

                const game = name?.split('/')[1];

                if (game != null && core.isGame(game)) {
                    return game;
                } else {
                    return 'basic';
                }
            },

            set(newValue: string) {
                if (core.isGame(newValue)) {
                    router.replace({ name: `setting/${newValue}` });
                } else {
                    router.replace({ name: 'setting' });
                }
            },
        });

        return {
            user,
            games,
            tab,

            drawerOpen,
        };
    },
});
</script>
