<template>
    <div class="display: contents">
        <template v-for="(p, k) in paramsInTitle" :key="k">
            <q-btn-dropdown
                v-if="p.option.type === 'enum'"
                :model-value="false"
                flat dense
                :label="paramLabel(p.option, core.getParam<string>(k))"
            >
                <q-list link style="width: 150px">
                    <q-item
                        v-for="o in p.option.values.value" :key="o"
                        v-close-popup
                        clickable
                        @click="commitParam(k as string, o)"
                    >
                        <q-item-section>
                            {{ paramLabel(p.option, o) }}
                        </q-item-section>
                    </q-item>
                </q-list>
            </q-btn-dropdown>

            <q-btn
                v-if="p.option.type === 'boolean'"
                :icon="p.option.icon![p.value ? 1 : 0]"
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

<script setup lang="ts">
import { computed } from 'vue';

import { Parameter, ParamOption, useCore } from 'store/core';
import { useGame } from 'store/games';

import basicSetup from 'setup/basic';

import UploaderBtn from 'components/UploaderBtn.vue';

import { ActionInfo } from 'store/core/action';

import { getValue } from 'src/stores/core/params';

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
    const result: Record<string, Parameter> = {};

    for (const k of Object.keys(core.params)) {
        const item = core.params[k];

        if (item.option.inTitle) {
            result[k] = item;

            result[k].value = getValue(k);
        }
    }

    return result;
});

const actionsWithIcon = computed(() => core.actions.filter(a => {
    if (a.icon == null) {
        return false;
    }

    if (a.enabled != null) {
        return a.enabled();
    }

    return true;
}));

const paramLabel = (p: ParamOption, v: string) => {
    if (p.label != null) {
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

</script>

<style lang="sass" scoped>
.code
    color: #777
    min-width: 40px
</style>
