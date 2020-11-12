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
import Scryfall from 'components/magic/data/Scryfall';
import Set from 'components/magic/data/Set';
import Card from 'components/magic/data/Card';
import BanlistChange from 'components/magic/data/BanlistChange';
import BanlistCheck from 'components/magic/data/BanlistCheck';

export default {
    name: 'Data',

    components: { Scryfall, Set, Card, BanlistChange, BanlistCheck },

    computed: {
        tabs() {
            return ['scryfall', 'set', 'card', 'banlist-change', 'banlist-check'];
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
            case 'card':
                return 'Card';
            case 'banlist-change':
                return 'BanlistChange';
            case 'banlist-check':
                return 'BanlistCheck';
            default:
                return null;
            }
        },
    },

};
</script>
