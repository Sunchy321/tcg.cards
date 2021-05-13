<template>
    <q-page class="q-pa-md">
        <q-btn
            v-for="g in games"
            :key="g"
            no-caps
            flat
            align="left"
            class="tcg-item"
            @click="$router.push('/' + g)"
        >
            <q-icon :name="`img:${g}/logo.svg`" />
            <span class="q-ml-sm">{{ fullName(g) }}</span>
        </q-btn>
    </q-page>
</template>

<style lang="sass" scoped>
.tcg-item
    width: 25%
</style>

<script lang="ts">
import { defineComponent } from 'vue';

import { useI18n } from 'vue-i18n';

import basicSetup from 'setup/basic';
import pageSetup from 'setup/page';

export default defineComponent({
    name: 'PageIndex',

    setup() {
        const i18n = useI18n();
        const basic = basicSetup();

        pageSetup({ });

        const fullName = (g: string) => {
            if (i18n.te(g + '.$selfFull')) {
                return i18n.t(g + '.$selfFull');
            } else {
                return i18n.t(g + '.$self');
            }
        };

        return {
            games: basic.games,
            fullName,
        };
    },
});
</script>
