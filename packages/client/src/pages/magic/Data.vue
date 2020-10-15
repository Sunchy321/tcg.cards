<template>
    <q-page>
        <q-tabs v-model="tab">
            <q-tab
                v-for="t in tabs"
                :key="t"
                :name="t"
                :label="$t('magic.data.tabs.' + t)"
            />
        </q-tabs>

        <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="scryfall">
                <div class="row items-center">
                    <div class="title">
                        {{ $t('magic.data.scryfall.bulk.data') }}
                    </div>

                    <q-btn
                        flat
                        :label="$t('magic.data.scryfall.bulk.get')"
                        @click="loadScryfallBulk"
                    />
                </div>
            </q-tab-panel>
        </q-tab-panels>
    </q-page>
</template>

<style lang="stylus" scoped>

.title
    font-size 150%

</style>

<script>
export default {
    data: () => ({
        tab: 'scryfall',

        bulk: {},
    }),

    computed: {
        tabs() {
            return ['scryfall'];
        },
    },

    watch: {
        tabs() {
            switch (this.tabs) {
            case 'scryfall':
            }
        },
    },

    methods: {
        async loadScryfall() {
            const { data: bulk } = await this.api.get('/magic/scryfall/bulk');

            this.bulk = bulk;
        },

        async loadScryfallBulk() {
            const ws = this.apiWs.create('/magic/scryfall/bulk/get');

            await new Promise((resolve, reject) => {
                ws.onmessage = e => {
                    console.log(e);
                };

                ws.onerror = reject;
                ws.onend = resolve;
            });
        },
    },
};
</script>
