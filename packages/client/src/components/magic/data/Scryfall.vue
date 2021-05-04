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
                <q-item v-for="f in bulk.allCard" :key="f">
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
                <q-item v-for="f in bulk.ruling" :key="f">
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

<style lang="sass" scoped>
.flex-grow
    flex-grow: 1
    width: inherit
</style>

<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';

import controlSetup from 'setup/control';

import bytes from 'bytes';

interface BulkList {
    allCard: string[];
    ruling: string[];
}

interface Scryfall {
    card: number;
    ruling: number;
    set: number;
}

interface Database {
    card: number;
    set: number;
}

interface Progress{
    method: 'get' | 'load' | 'merge',
    type: 'card' | 'ruling' | 'set' | 'image',

    amount: {
        updated?: number;
        count: number;
        total?: number;
    };

    time?: {
        elapsed: number;
        remaining: number;
    };
}

function formatTime(time: number) {
    let result = '';

    time = Math.floor(time / 1000);

    result = `${time % 60}`;

    time = Math.floor(time / 60);

    result = `${time % 60}:${result}`;

    time = Math.floor(time / 60);

    result = `${time % 60}:${result}`;

    time = Math.floor(time / 24);

    if (time > 0) {
        result = `${time} ${result}`;
    }

    return result;
}

export default defineComponent({
    name: 'DataScryfall',

    setup() {
        const { controlGet, controlWs } = controlSetup();

        const bulk = ref<BulkList>({ allCard: [], ruling: [] });
        const scryfall = ref<Scryfall>({ card: 0, ruling: 0, set: 0 });
        const database = ref<Database>({ card: 0, set: 0 });

        const progress = ref<Progress|null>(null);

        const progressValue = computed(() => {
            const prog = progress.value;

            if (prog != null && prog.amount.total != null) {
                return prog.amount.count / prog.amount.total;
            } else {
                return null;
            }
        });

        const progressLabel = computed(() => {
            const prog = progress.value;

            if (prog != null) {
                let result = '';

                result += `[${prog.method}] ${prog.type}: `;

                if (prog.method === 'get' && prog.type !== 'image') {
                    result += bytes(prog.amount.count);

                    if (prog.amount.total != null) {
                        result += `/${bytes(prog.amount.total)}`;
                    }
                } else {
                    if (prog.amount.updated != null) {
                        result += `${prog.amount.updated},`;
                    }

                    result += prog.amount.count;

                    if (prog.amount.total != null) {
                        result += `/${prog.amount.total}`;
                    }
                }

                if (prog.time != null) {
                    result += ` (${formatTime(prog.time.remaining)})`;
                }

                return result;
            } else {
                return '';
            }
        });

        const loadData = async() => {
            const { data } = await controlGet<{
                bulk: BulkList,
                scryfall: Scryfall,
                database: Database
            }>('/magic/scryfall');

            bulk.value = data.bulk;
            scryfall.value = data.scryfall;
            database.value = data.database;
        };

        const getBulk = async () => {
            const ws = controlWs('/magic/scryfall/bulk/get');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    void loadData();

                    resolve(undefined);
                };
            });
        };

        const loadBulk = async(file: string) => {
            const ws = controlWs('/magic/scryfall/bulk/load', { file });

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    void loadData();

                    resolve(undefined);
                };
            });
        };

        const getSet = async() => {
            const ws = controlWs('/magic/scryfall/set/get');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    void loadData();

                    resolve(undefined);
                };
            });
        };

        const mergeCard = async() => {
            const ws = controlWs('/magic/scryfall/card/merge');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    void loadData();

                    resolve(undefined);
                };
            });
        };

        const mergeRuling = async() => {
            const ws = controlWs('/magic/scryfall/ruling/merge');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    void loadData();

                    resolve(undefined);
                };
            });
        };

        const mergeSet = async() => {
            const ws = controlWs('/magic/scryfall/set/merge');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    void loadData();

                    resolve(undefined);
                };
            });
        };

        onMounted(loadData);

        return {
            bulk,
            scryfall,
            database,

            progress,
            progressValue,
            progressLabel,

            getBulk,
            loadBulk,
            mergeCard,
            mergeRuling,
            getSet,
            mergeSet,
        };
    },
});
</script>
