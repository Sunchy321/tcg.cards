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
                v-if="isAdmin"
                icon="mdi-database"
                flat dense round
                :to="dataPath"
            />

            <q-btn
                :icon="user != null ? 'mdi-cog' : 'mdi-cog-outline'"
                flat dense round
                :to="settingPath"
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

<script setup lang="ts">
import { ref, computed } from 'vue';

import { useQuasar } from 'quasar';

import basicSetup from 'setup/basic';

import HomeButton from 'components/HomeButton.vue';
import AppTitle from 'components/Title.vue';
import HeaderParams from 'components/HeaderParams.vue';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps<{
    drawerOpen?: boolean;
}>();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emit = defineEmits<{
    'update:drawerOpen': [newValue: boolean];
}>();

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
    if (!isAdmin.value) {
        return undefined;
    }

    if (game.value != null) {
        return { name: `${game.value}/data` };
    } else {
        return { name: 'integrated/data' };
    }
});

const settingPath = computed(() => {
    if (game.value != null) {
        return { name: `setting/${game.value}` };
    } else {
        return { name: 'setting' };
    }
});

</script>

<style lang="sass" scoped>
.convert-white
    filter: invert(99%) sepia(70%) saturate(62%) hue-rotate(350deg) brightness(114%) contrast(100%)
</style>
