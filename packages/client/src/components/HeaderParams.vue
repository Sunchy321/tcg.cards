<template>
    <div class="display: contents">
        <template v-for="(p, k) in paramsInTitle" :key="k">
            <q-btn-dropdown
                v-if="p.type === 'enum'"
                :model-value="false"
                flat dense
                :label="paramLabel(p, p.value)"
            >
                <q-list link style="width: 150px">
                    <q-item
                        v-for="o in (p as any).values" :key="o"
                        v-close-popup

                        clickable
                        @click="commitParam(k as string, o)"
                    >
                        <q-item-section>
                            {{ paramLabel(p, o) }}
                        </q-item-section>
                    </q-item>
                </q-list>
            </q-btn-dropdown>

            <q-btn
                v-if="p.type === 'boolean'"
                :icon="(p as any).icon[p.value ? 1:0]"
                flat round dense
                @click="commitParam(k as string, !p.value)"
            />
        </template>

        <q-btn-dropdown
            v-if="game != null"
            flat dense
            :model-value="false"
            :label="gameLocale"
        >
            <q-list link style="min-width: 150px">
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

        <template v-for="a in actionsWithIcon" :key="a.action">
            <uploader-btn
                v-if="a.popup && a.popup.type === 'file'"
                :icon="a.icon" flat dense
                round
                :url="a.popup.url"
                :accept="a.popup.accept"
                @uploading="v => invokeAction({ name: a.action, type: 'uploading', fallback: false }, v)"
                @uploaded="v => invokeAction({ name:a.action, type: 'uploaded' }, v)"
                @failed="v => invokeAction({ name:a.action, type: 'failed' }, v)"
            />
            <q-btn
                v-else
                :icon="a.icon" flat dense
                round
                @click="invokeAction({ name: a.action})"
            />
        </template>
    </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';

import { useCore } from 'store/core';
import { useGame } from 'store/games';

import basicSetup from 'setup/basic';

import UploaderBtn from 'components/UploaderBtn.vue';

import { Parameter } from 'src/stores/core/params';
import { ActionInfo } from 'src/stores/core/action';

export default defineComponent({
    components: { UploaderBtn },

    props: {
        drawerOpen: { type: Boolean, default: undefined },
    },

    emits: ['update:drawerOpen'],

    setup() {
        const core = useCore();
        const { game } = basicSetup();

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

        const paramsInTitle = computed(() => {
            const result: Record<string, Parameter & { value: any }> = {};

            for (const k of Object.keys(core.paramOptions)) {
                if (core.paramOptions[k].inTitle as boolean) {
                    result[k] = {
                        ...core.paramOptions[k],
                        value: core.params[k],
                    };
                }
            }

            return result;
        });

        const actionsWithIcon = computed(() => core.actions.filter(a => a.icon != null));

        const paramLabel = (p: any, v: string) => {
            if (p.label != null) {
                return p.label(v) as string;
            } else {
                return v;
            }
        };

        const commitParam = (key: string, value: any) => {
            core.params = {
                ...core.params,
                [key]: value,
            };
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

<style lang="sass" scoped>
.code
    color: #777
    min-width: 40px
</style>
