<template>
    <div class="q-pa-md">
        <q-btn-toggle
            v-model="style"
            class="q-ml-md"
            style="font-size: 20px"
            :options="styleOptions"
            outline
        >
            <template #raw>
                {0}
            </template>
            <template #normal>
                <magic-symbol value="{0}" />
            </template>
            <template #shadow>
                <magic-symbol value="{0}" :type="['cost']" />
            </template>
            <template #flat>
                <magic-symbol value="{0}" :type="['flat']" />
            </template>
        </q-btn-toggle>

        <div class="icon-list q-mt-md" :class="'icon-'+ style">
            <div v-for="(l, i) of symbols" :key="i" class="icon-line flex">
                <span
                    v-for="(s, j) of l" :key="j"
                    class="icon q-px-md flex justify-center"
                    :class="'icon-' + s"
                >
                    <div v-if="s === ''" />
                    <div v-else-if="style === 'raw'">{{ '{' + s + '}' }}</div>
                    <magic-symbol v-else :value="`{${s}}`" :type="type" />
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import MagicSymbol from 'components/magic/Symbol.vue';

const i18n = useI18n();

pageSetup({
    title: () => i18n.t('magic.ui.misc.symbol'),
});

const style = ref('normal');
const styleOptions = ['raw', 'normal', 'shadow', 'flat'].map(v => ({
    value: v,
    slot:  v,
}));

const symbols = computed(() => {
    const result = [];

    result.push(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    result.push(['10', '11', '12', '13', '14', '15', '16', '17', '18', '19']);
    result.push(['20', 'X', 'Y', 'Z', 'W', 'U', 'B', 'R', 'G', 'C']);

    result.push(['W/U', 'U/B', 'B/R', 'R/G', 'G/W', 'W/B', 'U/R', 'B/G', 'R/W', 'G/U']);
    result.push(['2/W', '2/U', '2/B', '2/R', '2/G', 'W/P', 'U/P', 'B/P', 'R/P', 'G/P', 'C/P']);

    if (style.value === 'flat') {
        result.push(['']);
    } else {
        result.push(['W/U/P', 'U/B/P', 'B/R/P', 'R/G/P', 'G/W/P', 'W/B/P', 'U/R/P', 'B/G/P', 'R/W/P', 'G/U/P']);
    }

    if (style.value === 'normal' || style.value === 'raw') {
        result.push(['T', 'Q', 'S', 'INF', 'H1', 'HW', 'HR', 'H', 'PW', 'E']);
        result.push(['A', 'TK', 'P']);
        result.push(['CHAOS', '100', '1000000']);
        result.push(['D', 'L']);
    } else if (style.value === 'shadow') {
        result.push(['', '', 'S', 'INF', 'H1', 'HW', 'HR']);
        result.push(['']);
        result.push(['', '100', '1000000']);
    } else if (style.value === 'flat') {
        result.push(['T']);
    }

    return result;
});

const type = computed(() => {
    switch (style.value) {
    case 'shadow': return ['cost'];
    case 'flat': return ['flat'];
    default: return [];
    }
});

</script>

<style lang="sass" scoped>
.icon-list
    &:not(.icon-raw)
        font-size: 24px

.icon-line
    height: 32px

.icon
    width: 60px

    &.icon-100
        width: 80px

    &.icon-1000000
        width: 160px
</style>
