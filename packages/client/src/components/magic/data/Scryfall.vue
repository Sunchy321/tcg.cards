<template>
    <div class="q-pa-md">
        <div v-if="progress != null" class="row items-center">
            <div class="q-mr-sm">
                {{ progressLabel }}
            </div>

            <q-linear-progress
                rounded
                color="primary"
                :indeterminate="progressValue == null"
                :value="progressValue"
                size="15px"
                class="flex-grow"
            />
        </div>

        <div class="row items-center">
            <div>Bulk Data</div>

            <q-btn flat label="Get" @click="getBulk" />
        </div>

        <div class="row q-gutter-md">
            <q-list class="col" bordered separator>
                <q-item v-for="f in allCards" :key="f">
                    <q-item-section>{{ f }}</q-item-section>
                    <q-item-section side>
                        <q-btn
                            flat dense round
                            icon="mdi-import"
                            @click="loadBulk(f)"
                        />
                    </q-item-section>
                </q-item>
            </q-list>

            <q-list class="col" bordered separator>
                <q-item v-for="f in rulings" :key="f">
                    <q-item-section>{{ f }}</q-item-section>
                    <q-item-section side>
                        <q-btn
                            flat dense round
                            icon="mdi-import"
                            @click="loadBulk(f)"
                        />
                    </q-item-section>
                </q-item>
            </q-list>
        </div>

        <div class="q-mt-xl q-mb-sm">
            Scryfall Data
        </div>

        <div class="row q-gutter-md">
            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Card</q-item-section>
                    <q-item-section side>
                        <q-btn
                            round dense flat
                            icon="mdi-merge"
                            @click="mergeCard"
                        />
                    </q-item-section>
                    <q-item-section side>
                        {{ scryfall.card }}
                    </q-item-section>
                </q-item>
            </q-list>

            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Ruling</q-item-section>
                    <q-item-section side>
                        <q-btn
                            round dense flat
                            icon="mdi-merge"
                            @click="mergeRuling"
                        />
                    </q-item-section>
                    <q-item-section side>
                        {{ scryfall.ruling }}
                    </q-item-section>
                </q-item>
            </q-list>

            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Set</q-item-section>
                    <q-item-section side>
                        <q-btn
                            round dense flat
                            icon="mdi-download"
                            @click="getSet"
                        />
                    </q-item-section>
                    <q-item-section side>
                        <q-btn
                            round dense flat
                            icon="mdi-merge"
                            @click="mergeSet"
                        />
                    </q-item-section>
                    <q-item-section side>
                        {{ scryfall.set }}
                    </q-item-section>
                </q-item>
            </q-list>
        </div>

        <div class="q-mt-xl q-mb-sm">
            Database Data
        </div>

        <div class="row q-gutter-md">
            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Card</q-item-section>
                    <q-item-section side>
                        {{ database.card }}
                    </q-item-section>
                </q-item>
            </q-list>
            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Set</q-item-section>
                    <q-item-section side>
                        {{ database.set }}
                    </q-item-section>
                </q-item>
            </q-list>
        </div>
    </div>
</template>

<style lang="stylus" scoped>

.flex-grow
    flex-grow 1
    width inherit

</style>

<script>
import bytes from 'bytes';

function formatTime(time) {
    let result = '';

    time = Math.floor(time / 1000);

    result = (time % 60) + result;

    time = Math.floor(time / 60);

    result = (time % 60) + ':' + result;

    time = Math.floor(time / 60);

    result = (time % 60) + ':' + result;

    time = Math.floor(time / 24);

    if (time > 0) {
        result = time + ' ' + result;
    }

    return result;
}

export default {
    name: 'DataScryfall',

    data: () => ({
        bulk:     {},
        scryfall: {
            card:   0,
            ruling: 0,
            set:    0,
        },
        database: {
            card: 0,
            set:  0,
        },

        progress: null,
    }),

    computed: {
        progressValue() {
            const prog = this.progress;

            if (prog != null && prog.amount.total != null) {
                return prog.amount.count / prog.amount.total;
            } else {
                return null;
            }
        },

        progressLabel() {
            const prog = this.progress;

            if (prog != null) {
                let result = '';

                result += `[${prog.method}] ${prog.type}: `;

                if (prog.method === 'get' && prog.type !== 'image') {
                    result += bytes(prog.amount.count);

                    if (prog.amount.total != null) {
                        result += '/' + bytes(prog.amount.total);
                    }
                } else {
                    if (prog.amount.updated != null) {
                        result += prog.amount.updated + ',';
                    }

                    result += prog.amount.count;

                    if (prog.amount.total != null) {
                        result += '/' + prog.amount.total;
                    }
                }

                if (prog.time != null) {
                    result += ` (${formatTime(prog.time.remaining)})`;
                }

                return result;
            } else {
                return '';
            }
        },

        allCards() {
            return this.bulk?.allCard ?? [];
        },

        rulings() {
            return this.bulk?.ruling ?? [];
        },
    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData() {
            const { data } = await this.apiGet('/magic/scryfall');

            this.bulk = data.bulk;
            this.scryfall = data.scryfall;
            this.database = data.database;
        },

        async getBulk() {
            const ws = this.apiWs('/magic/scryfall/bulk/get');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);

                    this.progress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.progress = null;
                    this.loadData();

                    resolve();
                };
            });
        },

        async loadBulk(file) {
            const ws = this.apiWs('/magic/scryfall/bulk/load', { file });

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);

                    this.progress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.progress = null;
                    this.loadData();

                    resolve();
                };
            });
        },

        async getSet() {
            const ws = this.apiWs('/magic/scryfall/set/get');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);

                    this.progress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.progress = null;
                    this.loadData();

                    resolve();
                };
            });
        },

        async mergeCard() {
            const ws = this.apiWs('/magic/scryfall/card/merge');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);

                    this.progress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.progress = null;
                    this.loadData();

                    resolve();
                };
            });
        },

        async mergeRuling() {
            const ws = this.apiWs('/magic/scryfall/ruling/merge');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);

                    this.progress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.progress = null;
                    this.loadData();

                    resolve();
                };
            });
        },

        async mergeSet() {
            const ws = this.apiWs('/magic/scryfall/set/merge');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);

                    this.progress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.progress = null;
                    this.loadData();

                    resolve();
                };
            });
        },
    },
};
</script>
