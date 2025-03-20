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
                        {{ keyMap[l][k] }}
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import keywords from 'data/magic/keyword.yml';

import { locales } from 'static/magic/basic';

import enKeywords from 'data/magic/localization/keyword/en.yml';
import zhsKeywords from 'data/magic/localization/keyword/zhs.yml';
import zhtKeywords from 'data/magic/localization/keyword/zht.yml';
import deKeywords from 'data/magic/localization/keyword/de.yml';
import frKeywords from 'data/magic/localization/keyword/fr.yml';
import itKeywords from 'data/magic/localization/keyword/it.yml';
import jaKeywords from 'data/magic/localization/keyword/ja.yml';
import koKeywords from 'data/magic/localization/keyword/ko.yml';
import ptKeywords from 'data/magic/localization/keyword/pt.yml';
import ruKeywords from 'data/magic/localization/keyword/ru.yml';
import esKeywords from 'data/magic/localization/keyword/es.yml';

const i18n = useI18n();

pageSetup({
    title: () => i18n.t('magic.ui.misc.keyword'),
});

const keyMap: Record<string, Record<string, string>> = {
    en:  enKeywords,
    zhs: zhsKeywords,
    zht: zhtKeywords,
    de:  deKeywords,
    fr:  frKeywords,
    it:  itKeywords,
    ja:  jaKeywords,
    ko:  koKeywords,
    pt:  ptKeywords,
    ru:  ruKeywords,
    es:  esKeywords,
};

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
