<template>
    <q-header class="header" elevated>
        <q-toolbar>
            <q-btn
                :class="{ 'convert-white': homeIcon.startsWith('img:') }"
                :icon="homeIcon"
                flat dense round
                :to="homePath"
            />

            <q-btn
                v-if="drawerOpen != null && !(isMobile && showParams)"
                icon="mdi-menu"
                flat dense round
                @click="$emit('update:drawerOpen',!drawerOpen)"
            />

            <app-title />

            <q-btn
                v-if="isMobile"
                key="show-params" class="show-params"
                :icon="paramsIcon"
                flat dense round
                @click="showParams = !showParams"
            />

            <header-params v-if="!isMobile" key="params" class="params" />

            <q-btn
                v-if="isAdmin && game != null"
                icon="mdi-database"
                flat dense round
                :to="dataPath"
            />

            <q-btn
                :icon="user != null ? 'mdi-cog' : 'mdi-cog-outline'"
                flat dense round
                :to="{ name: 'setting' }"
            />

        </q-toolbar>
        <q-toolbar v-if="isMobile && showParams">
            <q-btn
                v-if="drawerOpen != null"
                icon="mdi-menu"
                flat dense round
                @click="$emit('update:drawerOpen',!drawerOpen)"
            />

            <q-space />

            <header-params key="params" class="params" />
        </q-toolbar>
    </q-header>
</template>

<style lang="sass" scoped>
.convert-white
    filter: invert(99%) sepia(70%) saturate(62%) hue-rotate(350deg) brightness(114%) contrast(100%)
</style>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';

import { useQuasar } from 'quasar';
import { ActionInfo, useCore } from 'store/core';
import { useGame } from 'store/games';

import basicSetup from 'setup/basic';

import AppTitle from 'components/Title.vue';
import HeaderParams from 'components/HeaderParams.vue';

import { pickBy } from 'lodash';

export default defineComponent({
    components: { AppTitle, HeaderParams },

    props: {
        drawerOpen: { type: Boolean, default: undefined },
    },

    emits: ['update:drawerOpen'],

    setup() {
        const quasar = useQuasar();
        const core = useCore();
        const { game, user, isAdmin } = basicSetup();

        const isMobile = computed(() => quasar.platform.is.mobile);
        const showParams = ref(false);

        const titleType = computed(() => core.titleType);

        const homePath = computed(() => {
            if (game.value == null) {
                return '/';
            } else {
                return `/${game.value}`;
            }
        });

        const homeIcon = computed(() => {
            if (game.value == null) {
                return 'mdi-home';
            }

            return `img:/${game.value}/logo.svg`;
        });

        const paramsIcon = computed(() => {
            if (showParams.value) {
                return 'mdi-chevron-up-circle';
            } else {
                return 'mdi-chevron-down-circle';
            }
        });

        const dataPath = computed(() => {
            if (isAdmin.value && game.value != null) {
                return `/${game.value}/data`;
            } else {
                return undefined;
            }
        });

        const gameLocale = computed({
            get(): string {
                if (game.value != null) {
                    return useGame(game.value)().locale;
                } else {
                    return 'en';
                }
            },
            set(newValue: string) {
                if (game.value != null) {
                    useGame(game.value)().locale = newValue;
                }
            },
        });

        const gameLocales = computed(() => {
            if (game.value != null) {
                return useGame(game.value)().locales;
            } else {
                return [];
            }
        });

        const paramsInTitle = computed(() => pickBy(core.params, v => v.inTitle));
        const actionsWithIcon = computed(() => core.actions.filter(a => a.icon != null));

        const paramLabel = (p: any, v: string) => {
            if (p.label != null) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                return p.label(v) as string;
            } else {
                return v;
            }
        };

        const commitParam = (key: string, value: any) => {
            core.setParam(key, value);
        };

        const invokeAction = (action: ActionInfo, payload?: any) => {
            if (payload != null) {
                core.invokeAction({ ...action, payload });
            } else {
                core.invokeAction(action);
            }
        };

        return {
            game,
            user,
            isAdmin,
            isMobile,
            showParams,
            titleType,

            homePath,
            dataPath,
            homeIcon,
            paramsIcon,
            gameLocale,
            gameLocales,

            paramsInTitle,
            actionsWithIcon,

            paramLabel,
            commitParam,
            invokeAction,
        };
    },
});
</script>
