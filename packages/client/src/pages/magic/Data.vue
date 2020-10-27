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

        <component :is="tabComponent" />
    </q-page>
</template>

<style lang="stylus" scoped>

.flex-grow
    flex-grow 1

</style>

<script>
import Scryfall from './data/Scryfall';
import Set from './data/Set';
import BanlistChange from './data/BanlistChange';

export default {
    name: 'Data',

    components: { Scryfall, Set, BanlistChange },

    computed: {
        tabs() {
            return ['scryfall', 'set', 'banlist-change'];
        },

        tab: {
            get() {
                return this.$route.query.tab ?? 'scryfall';
            },
            set(newValue) {
                this.$router.replace({
                    path:  '/magic/data',
                    query: { tab: newValue },
                });
            },
        },

        tabComponent() {
            switch (this.tab) {
            case 'scryfall':
                return 'Scryfall';
            case 'set':
                return 'Set';
            case 'banlist-change':
                return 'BanlistChange';
            default:
                return null;
            }
        },
    },

};
</script>
