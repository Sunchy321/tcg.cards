<template>
    <div class="q-pa-md">
        <div class="row items-center">
            <div>Bulk Data</div>

            <q-btn
                flat
                label="Get"
                @click="getBulk"
            />

            <div
                v-if="bulkProgress != null"
                class="q-mr-sm"
            >
                {{ bulkProgressLabel }}
            </div>

            <q-linear-progress
                v-if="bulkProgress != null"
                rounded
                color="primary"
                :indeterminate="bulkProgressValue == null"
                :value="bulkProgressValue"
                size="15px"
                class="flex-grow"
            />
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

        <div class="row items-center q-mt-xl">
            <div>Database Data</div>

            <div
                v-if="dataProgress != null"
                class="q-mr-sm"
            >
                {{ dataProgressLabel }}
            </div>

            <q-linear-progress
                v-if="dataProgress != null"
                rounded
                color="primary"
                :indeterminate="bulkProgressValue == null"
                :value="bulkProgressValue"
                size="15px"
                class="flex-grow"
            />
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
                        {{ database.card }}
                    </q-item-section>
                </q-item>
            </q-list>

            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Ruling</q-item-section>
                    <q-item-section side>
                        {{ database.ruling }}
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

export default {
    name: 'DataScryfall',

    data: () => ({
        bulk:     {},
        database: {
            card:   0,
            ruling: 0,
            set:    0,
        },

        bulkProgress: null,
        dataProgress: null,
    }),

    computed: {
        bulkProgressValue() {
            const prog = this.bulkProgress;

            if (prog != null && prog.total != null) {
                return prog.count / prog.total;
            } else {
                return null;
            }
        },

        bulkProgressLabel() {
            const prog = this.bulkProgress;

            if (prog != null) {
                const head = `[${prog.method}] ${prog.type}:`;

                if (prog.method === 'get') {
                    if (prog.total != null) {
                        return `${head} ${bytes(prog.count)}/${bytes(prog.total)}`;
                    } else {
                        return `${head} ${bytes(prog.count)}`;
                    }
                } else {
                    if (prog.total != null) {
                        return `${head} ${prog.count}/${prog.total}`;
                    } else {
                        return `${head} ${prog.count}`;
                    }
                }
            } else {
                return '';
            }
        },

        dataProgressValue() {
            const prog = this.dataProgress;

            if (prog != null && prog.total != null) {
                return prog.count / prog.total;
            } else {
                return null;
            }
        },

        dataProgressLabel() {
            const prog = this.dataProgress;

            if (prog != null) {
                const head = `[${prog.method}] ${prog.type}:`;

                if (prog.method === 'get') {
                    if (prog.total != null) {
                        return `${head} ${bytes(prog.count)}/${bytes(prog.total)}`;
                    } else {
                        return `${head} ${bytes(prog.count)}`;
                    }
                } else {
                    if (prog.total != null) {
                        return `${head} ${prog.count}/${prog.total}`;
                    } else {
                        return `${head} ${prog.count}`;
                    }
                }
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
            this.database = data.database;
        },

        async getBulk() {
            const ws = this.apiWs('/magic/scryfall/bulk/get');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);

                    this.bulkProgress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.bulkProgress = null;
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

                    this.bulkProgress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.bulkProgress = null;
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

                    this.dataProgress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.dataProgress = null;
                    this.loadData();

                    resolve();
                };
            });
        },

        async mergeCard() {
            // TODO
        },

        async mergeSet() {
            const ws = this.apiWs('/magic/scryfall/set/merge');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);

                    this.dataProgress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.dataProgress = null;
                    this.loadData();

                    resolve();
                };
            });
        },
    },
};
</script>
