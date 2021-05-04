z<template>
    <q-page>
        <q-tabs v-model="tab">
            <q-tab
                v-for="t in tabs"
                :key="t"
                :name="t"
                :label="t.replace('-', ' ')"
            />
        </q-tabs>

        <component :is="tab" />
    </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import pageSetup from 'setup/page';

import components from 'components/hearthstone/data';

export default defineComponent({
    name: 'Data',

    components: { ...components },

    setup() {
        const tabs = Object.keys(components);

        const { tab } = pageSetup({
            title: 'Data',

            params: {
                tab: {
                    type:   'enum',
                    bind:   'query',
                    values: tabs,
                },
            },
        });

        return { tabs, tab };
    },
});
</script>
