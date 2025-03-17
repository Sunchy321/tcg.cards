<template>
    <q-page class="main q-pa-md">
        <q-btn
            v-for="g in games"
            :key="g"
            :to="`/${g}`"
            no-caps
            outline
            class="tcg-item"
        >
            <div class="tcg-item-card">
                <q-img class="tcg-icon" :src="`${g}/logo.svg`" />
                <span class="tcg-label">{{ fullName(g) }}</span>
            </div>
        </q-btn>
    </q-page>
</template>

<script setup lang="ts">

import { useI18n } from 'vue-i18n';

import basicSetup from 'setup/basic';
import pageSetup from 'setup/page';

const i18n = useI18n();
const { games } = basicSetup();

pageSetup({ });

const fullName = (g: string) => {
    if (i18n.te(`${g}.$selfFull`)) {
        return i18n.t(`${g}.$selfFull`);
    } else {
        return i18n.t(`${g}.$self`);
    }
};

</script>

<style lang="sass" scoped>
@media (max-width: 599px)
    .main
        display: flex
        flex-direction: column
        justify-content: start

    .tcg-item
        width: 100%
        margin: 8px

    .tcg-item-card
        width: 100%
        height: 100%

        display: flex
        justify-content: start
        align-items: center

    .tcg-icon
        width: 40px
        height: 40px

    .tcg-label
        margin-left: 10px

@media (min-width: 600px)
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
