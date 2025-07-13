<template>
    <div class="q-pa-md">
        <q-btn-toggle
            v-model="mode"
            class="q-mb-md"
            toggle-color="primary"
            :options="modeOptions"
            outline
        />

        <table v-for="t in Object.keys(keywords)" :key="t" class="keyword-table q-mb-md">
            <caption>{{ $t('magic.ui.misc.keyword-type.' + t) }}</caption>

            <thead>
                <tr>
                    <th v-for="l in locales" :key="l">
                        {{ $t('lang.' + l) }}
                    </th>
                </tr>
            </thead>

            <tbody>
                <tr v-for="k in keywordOf(t)" :key="k">
                    <td v-for="l in locales" :key="l">
                        {{ keywordMap[l][k] }}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { useI18n } from 'vue-i18n';
import { useTitle } from 'store/core';

import keywords from '@data/magic/keyword.yml';

import { mapKeys } from 'lodash';

import { locales } from '@static/magic/basic';

const keywordMap = mapKeys(
    import.meta.glob('@data/magic/localization/keyword/*.yml', { eager: true }),
    (_, k) => /^@data\/magic\/localization\/keyword\/(.*?)\.yml$/.exec(k)![1],
);

const i18n = useI18n();

useTitle(() => i18n.t('magic.ui.misc.keyword'));

const mode = ref('variant');

const modeOptions = ['simple', 'variant', 'full'].map(m => ({
    value: m,
    label: i18n.t(`magic.ui.misc.keyword-mode.${m}`),
}));

const keywordOf = (type: string) => {
    const values = (keywords as any)[type] as string[];

    if (mode.value === 'simple') {
        return values.filter(v => /^[a-z_]+$/.test(v));
    } else if (mode.value === 'variant') {
        return values.filter(v => /^[a-z_/]+$/.test(v));
    } else {
        return values;
    }
};

</script>

<style lang="sass">

.keyword-table
    position: relative
    width: 100%
    border-collapse: collapse

    & th
        position: sticky
        background-color: lightgrey
        top: 50px

    & td
        border: 1px black solid

</style>
