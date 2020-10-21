<template>
    <q-page>
        <q-tabs v-model="tab">
            <q-tab
                v-for="t in tabs"
                :key="t"
                :name="t"
                label="Scryfall"
            />
        </q-tabs>

        <component :is="'DataScryfall'" />
    </q-page>
</template>

<style lang="stylus" scoped>

.flex-grow
    flex-grow 1

</style>

<script>
import DataScryfall from './data/Scryfall';

export default {
    name: 'Data',

    components: { DataScryfall },

    data: () => ({
        tab: 'scryfall',
    }),

    computed: {
        tabs() {
            return ['scryfall'];
        },
    },

};
</script>
