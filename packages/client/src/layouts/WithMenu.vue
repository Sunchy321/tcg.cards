<template>
    <q-layout view="hHh Lpr fFf">
        <app-header v-model:drawer-open="drawerOpen" />

        <q-drawer v-model="drawerOpen" show-if-above>
            <q-tree
                v-show="menu.length > 0"
                v-model:selected="selected"
                v-model:expanded="expanded"
                class=""
                no-connectors
                :nodes="menu"
                node-key="id"
            />
        </q-drawer>

        <q-page-container>
            <q-ajax-bar />
            <router-view
                ref="main"
                v-model:selected="selected"
                v-model:expanded="expanded"
                @update:menu="updateMenu"
            />
        </q-page-container>
    </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import AppHeader from 'components/Header.vue';

export interface Menu {
    id: string;
    label: string;
    children?: Menu[];
}

const drawerOpen = ref(false);

const menu = ref<Menu[]>([]);
const selected = ref<string | null>(null);
const expanded = ref<string[]>([]);

const updateMenu = (newMenu: Menu[]) => { menu.value = newMenu; };

</script>
