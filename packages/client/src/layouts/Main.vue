<template>
    <q-layout view="hHh Lpr fFf">
        <app-header />

        <q-page-container>
            <q-ajax-bar />
            <router-view ref="main" />
        </q-page-container>
    </q-layout>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import AppHeader from 'components/Header.vue';

export default defineComponent({
    components: { AppHeader },

});
</script>
