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
        </div>

        <div class="row q-gutter-md">
            <q-btn
                dense outline
                @click="loadCard"
            >
                Card
            </q-btn>
        </div>

        <div class="q-mt-md q-mb-sm">
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
                    <q-item-section>Print</q-item-section>
                    <q-item-section side>
                        {{ database.print }}
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

<script setup lang="ts">
import {
    ref, computed, onMounted,
} from 'vue';

import controlSetup from 'setup/control';

import bytes from 'bytes';

interface Database {
    card:  number;
    print: number;
    set:   number;
}

interface Progress {
    method: string;
    type:   string;

    amount: {
        updated?: number;
        count:    number;
        total?:   number;
    };

    time?: {
        elapsed:   number;
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

const { controlGet, controlWs } = controlSetup();

const database = ref<Database>({ card: 0, print: 0, set: 0 });

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

const loadBulk = async () => {
    const { data } = await controlGet<{
        database: Database;
    }>('/yugioh/yugioh-history');

    database.value = data.database;
};

const loadCard = async () => {
    const ws = controlWs('/yugioh/yugioh-history/load-card');

    return new Promise((resolve, reject) => {
        ws.onmessage = ({ data }) => {
            progress.value = JSON.parse(data) as Progress;
        };

        ws.onerror = reject;
        ws.onclose = () => {
            progress.value = null;
            void loadBulk();

            resolve(undefined);
        };
    });
};

onMounted(loadBulk);

</script>
