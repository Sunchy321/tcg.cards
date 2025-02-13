<template>
    <q-page>
        <q-drawer :model-value="true" :width="200">
            <q-list>
                <q-item
                    v-for="i in items" :key="i.id"
                    :to="{ name: i.to }"
                    class="navigation text-black bg-grey-3"
                >
                    <q-item-section>{{ $t('hearthstone.ui.misc.' + i.id) }}</q-item-section>
                    <q-item-section v-if="isCurrent(i.to)" side>
                        <q-icon name="mdi-menu-right" />
                    </q-item-section>
                </q-item>
            </q-list>
        </q-drawer>

        <router-view />
    </q-page>
</template>

<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();

const items = [
    {
        id: 'tag',
        to: 'hearthstone/misc/tag',
    },
];

const isCurrent = (name: string) => {
    const { path } = route;
    const target = router.resolve({ name });

    return path === target.path;
};

</script>

<style lang="sass" scoped>
.navigation
    &:hover
        text-decoration: none

    color: black
    background-color: $grey-3
</style>
