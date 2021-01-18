<template>
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

<script>
import page from 'src/mixins/page';

import * as components from 'components/magic/data';

import routeComputed from 'src/route-computed';

export default {
    name: 'Data',

    components,

    mixins: [page],

    computed: {
        pageOptions() {
            return {
                title: 'Data',
            };
        },

        tabs() {
            return Object.keys(components);
        },

        tab: routeComputed('tab', { keep: false }),
    },

};
</script>
