<template>
    <q-layout view="hHh Lpr fFf">
        <app-header v-model:drawer-open="drawerOpen" />

        <q-drawer v-model="drawerOpen" show-if-above class="q-pa-md">
            <component :is="session.data == null ? UserLogin : UserProfile" />

            <q-tabs v-model="tab" class="left-tabs" vertical>
                <q-tab name="basic" :label="$t('setting.basic')" />
                <q-tab
                    v-for="g in games" :key="g"
                    :name="g" :label="fullName(g)"
                />
            </q-tabs>
        </q-drawer>

        <q-page-container>
            <q-ajax-bar />
            <router-view ref="main" />
        </q-page-container>
    </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';

import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { useCore, useTitle } from 'store/core';

import UserLogin from 'components/setting/Login.vue';
import UserProfile from 'components/setting/Profile.vue';

import AppHeader from 'components/Header.vue';

import { auth } from '@/auth';

import { games } from '@interface/index';

export interface Menu {
    id:        string;
    label:     string;
    children?: Menu[];
}

const i18n = useI18n();
const router = useRouter();
const route = useRoute();
const core = useCore();

const session = auth.useSession();

useTitle(() => i18n.t('setting.$self'));

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

const fullName = (g: string) => {
    if (i18n.te(`${g}.$selfFull`)) {
        return i18n.t(`${g}.$selfFull`);
    } else {
        return i18n.t(`${g}.$self`);
    }
};

watchEffect(() => {
    if (session.value.data != null && route.query.redirect != null) {
        router.push(route.query.redirect as string);
    }
});

</script>

<style lang="sass" scoped>

.left-tabs
    height: unset

</style>
