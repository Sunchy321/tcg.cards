<template>
    <q-page class="main q-pa-md">
        <q-btn
            v-for="g in games"
            :key="g"
            no-caps
            flat
            align="left"
            class="tcg-item q-card"
            @click="$router.push('/' + g)"
        >
            <div class="tcg-item-card">
                <q-img class="tcg-icon" :src="`${g}/logo.svg`" />
                <span class="tcg-label">{{ fullName(g) }}</span>
            </div>
        </q-btn>
    </q-page>
</template>

<style lang="sass" scoped>
.main
    display: flex
    justify-content: center

.tcg-item
    width: 200px
    height: 250px
    margin: 8px

.tcg-item-card
    width: 100%
    height: 100%

    display: flex
    flex-direction: column
    justify-content: space-around
    align-items: center

    padding-top: 30px
    padding-bottom: 30px

.tcg-icon
    width: 60%
    height: 60%
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
