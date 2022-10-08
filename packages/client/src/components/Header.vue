<template>
    <q-header class="header" elevated>
        <q-toolbar>
            <home-button />

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

import basicSetup from 'setup/basic';

import HomeButton from 'components/HomeButton.vue';
import AppTitle from 'components/Title.vue';
import HeaderParams from 'components/HeaderParams.vue';

export default defineComponent({
    components: { HomeButton, AppTitle, HeaderParams },

    props: {
        drawerOpen: { type: Boolean, default: undefined },
    },

    emits: ['update:drawerOpen'],

    setup() {
        const quasar = useQuasar();
        const { game, user, isAdmin } = basicSetup();

        const isMobile = computed(() => quasar.platform.is.mobile);
        const showParams = ref(false);

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

        return {
            game,
            user,
            isAdmin,
            isMobile,
            showParams,

            dataPath,
            paramsIcon,
        };
    },
});
</script>
