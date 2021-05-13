<template>
    <q-layout view="hHh Lpr fFf">
        <q-header elevated>
            <q-toolbar>
                <q-btn
                    :class="{ 'convert-white': homeIcon.startsWith('img:') }"
                    :icon="homeIcon"
                    flat dense round
                    :to="homePath"
                />

                <app-title />

                <template v-for="(p, k) in paramsInTitle">
                    <q-btn-dropdown
                        v-if="p.type === 'enum'"
                        :key="k"
                        flat dense
                        :label="paramLabel(p, p.value)"
                    >
                        <q-list link style="width: 150px">
                            <q-item
                                v-for="o in p.values" :key="o"
                                v-close-popup

                                clickable
                                @click="commitParam(k, o)"
                            >
                                <q-item-section>
                                    {{ paramLabel(p, o) }}
                                </q-item-section>
                            </q-item>
                        </q-list>
                    </q-btn-dropdown>
                </template>

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
                            <q-item-section>
                                {{ $t('lang.' + l) }}
                            </q-item-section>
                        </q-item>
                    </q-list>
                </q-btn-dropdown>

                <q-btn
                    v-for="a in actionsWithIcon" :key="a.action"
                    :icon="a.icon"
                    flat dense round
                    @click="commitAction(a.action)"
                />

                <q-btn
                    v-if="isAdmin && game != null"
                    icon="mdi-database"
                    flat dense round
                    :to="dataPath"
                />

                <q-btn
                    :icon="user != null ? 'mdi-cog' : 'mdi-cog-outline'"
                    flat dense round
                    :to="'/setting'"
                />
            </q-toolbar>
        </q-header>

        <q-page-container>
            <q-ajax-bar />
            <router-view ref="main" />
        </q-page-container>
    </q-layout>
</template>

<style lang="sass" scoped>
.convert-white
    filter: invert(99%) sepia(70%) saturate(62%) hue-rotate(350deg) brightness(114%) contrast(100%)

.code
    color: #777
    width: 40px
</style>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'src/store';

import basicSetup from 'setup/basic';

import AppTitle from 'components/Title.vue';

import { pickBy } from 'lodash';

export default defineComponent({
    components: { AppTitle },

    setup() {
        const route = useRoute();
        const store = useStore();
        const { game, user, isAdmin } = basicSetup();

        const homePath = computed(() => {
            if (game.value == null) {
                return '/';
            }

            if (route.path === `/${game.value}`) {
                return '/';
            }

            if (route.path === `/${game.value}/`) {
                return '/';
            }

            return `/${game.value}`;
        });

        const homeIcon = computed(() => {
            if (game.value == null) {
                return 'mdi-home';
            }

            if (route.path === `/${game.value}`) {
                return 'mdi-home';
            }

            if (route.path === `/${game.value}/`) {
                return 'mdi-home';
            }

            return `img:${game.value}/logo.svg`;
        });

        const dataPath = computed(() => {
            if (isAdmin.value && game.value != null) {
                return `/${game.value}/data`;
            } else {
                return null;
            }
        });

        const gameLocale = computed({
            get() {
                if (game.value != null) {
                    return store.getters[`${game.value}/locale` as const];
                } else {
                    return null;
                }
            },
            set(newValue) {
                if (game.value != null) {
                    store.commit(`${game.value}/locale`, newValue);
                }
            },
        });

        const gameLocales = computed(() => {
            if (game.value != null) {
                return store.getters[`${game.value}/locales` as const];
            } else {
                return [];
            }
        });

        const paramsInTitle = computed(() => pickBy(store.getters.params, v => v.inTitle));
        const actionsWithIcon = computed(() => store.getters.actions.filter(a => a.icon != null));

        const paramLabel = (p: any, v: string) => {
            if (p.label) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                return p.label(v) as string;
            } else {
                return v;
            }
        };

        const commitParam = (key: any, value: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            store.commit('param', { key, value });
        };

        const commitAction = (action: string) => {
            void store.dispatch('action', action);
        };

        return {
            game,
            user,
            isAdmin,

            homePath,
            dataPath,
            homeIcon,
            gameLocale,
            gameLocales,

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            paramsInTitle: paramsInTitle as any,
            actionsWithIcon,

            paramLabel,
            commitParam,
            commitAction,
        };
    },
});
</script>
