<template>
    <q-page>
        <div class="row">
            <div class="col q-ma-md">
                <div class="q-mb-sm">
                    <q-btn icon="mdi-play" round flat dense />
                </div>
                <q-list dense bordered padding class="rounded-borders">
                    <q-item v-for="c in cards" :key="c">
                        <q-item-section avatar>
                            <q-radio v-model="selectedCard" :val="c" />
                        </q-item-section>
                        <q-item-section>{{ c }}</q-item-section>
                    </q-item>
                </q-list>
            </div>
            <div class="col q-ma-md">
                <div class="q-mb-sm">
                    <q-btn icon="mdi-play" round flat dense />
                </div>
                <q-list dense bordered padding class="rounded-borders">
                    <q-item v-for="r in rulings" :key="r">
                        <q-item-section avatar>
                            <q-radio v-model="selectedRuling" :val="r" />
                        </q-item-section>
                        <q-item-section>{{ r }}</q-item-section>
                    </q-item>
                </q-list>
            </div>
        </div>
    </q-page>
</template>

<script>
export default {
    data() {
        return {
            cards:   [],
            rulings: [],

            selectedCard:   null,
            selectedRuling: null,
        };
    },

    watch: {
        $route: {
            immediate: true,
            handler() {
                this.loadData();
            },
        },
    },

    methods: {
        async loadData() {
            const { data } = await this.$axios.get('/control/magic/scryfall/bulk-list');

            this.cards = data.cards;
            this.rulings = data.rulings;

            this.selectedCard = data.cards[0];
            this.selectedRuling = data.rulings[0];
        },
    },
};
</script>

<style>

</style>
