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
                class="col-grow"
            />
        </div>

        <div class="row items-center">
            <div>Bulk Data</div>

            <q-btn flat label="Get" @click="getBulk" />
        </div>

        <div class="row q-gutter-md">
            <div class="col flex justify-between items-center">
                <q-select
                    v-model="bulkAllCard"
                    class="col-grow"
                    :options="bulk.allCard"
                    dense outlined
                />

                <q-btn
                    flat dense round
                    class="q-ml-sm"
                    icon="mdi-merge"
                    @click="loadCard(bulkAllCard)"
                />
            </div>

            <div class="col flex justify-between items-center">
                <q-select
                    v-model="bulkRuling"
                    class="col-grow"
                    :options="bulk.ruling"
                    dense outlined
                />

                <q-btn
                    flat dense round
                    class="q-ml-sm"
                    icon="mdi-merge"
                    @click="loadRuling(bulkRuling)"
                />
            </div>
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
                    <q-item-section side>
                        <q-btn
                            round dense flat
                            icon="mdi-download"
                            @click="getSet"
                        />
                    </q-item-section>
                </q-item>
            </q-list>
        </div>
    </div>
</template>

<script lang="ts">
import {
    defineComponent, ref, computed, onMounted, watch,
} from 'vue';

import controlSetup from 'setup/control';

import bytes from 'bytes';
import { last } from 'lodash';

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

interface Progress {
    method: 'get' | 'load' | 'merge';
    type: 'card' | 'image' | 'ruling' | 'set';

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

        const bulkAllCard = ref<string>('');
        const bulkRuling = ref<string>('');

        const progress = ref<Progress | null>(null);

        const progressValue = computed(() => {
            const prog = progress.value;

            if (prog?.amount?.total != null) {
                return prog.amount.count / prog.amount.total;
            } else {
                return undefined;
            }
        });

        const progressLabel = computed(() => {
            const prog = progress.value;

            if (prog != null) {
                let result = '';

                result += `[${prog.method}] ${prog.type}: `;

                if (prog.method === 'get' && !['set', 'image'].includes(prog.type)) {
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

        const loadData = async () => {
            const { data } = await controlGet<{
                bulk: BulkList;
                scryfall: Scryfall;
                database: Database;
            }>('/magic/scryfall');

            bulk.value = data.bulk;
            scryfall.value = data.scryfall;
            database.value = data.database;
        };

        const getBulk = async () => {
            const ws = controlWs('/magic/scryfall/get-bulk');

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

        const loadCard = async (file: string) => {
            const ws = controlWs('/magic/scryfall/load-card', { file });

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

        const loadRuling = async (file: string) => {
            const ws = controlWs('/magic/scryfall/load-ruling', { file });

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

        const getSet = async () => {
            const ws = controlWs('/magic/scryfall/get-set');

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

        watch(bulk, ({ allCard, ruling }) => {
            bulkAllCard.value = last(allCard) ?? '';
            bulkRuling.value = last(ruling) ?? '';
        });

        return {
            bulk,
            scryfall,
            database,

            bulkAllCard,
            bulkRuling,

            progress,
            progressValue,
            progressLabel,

            getBulk,
            loadCard,
            loadRuling,
            getSet,
        };
    },
});
</script>
