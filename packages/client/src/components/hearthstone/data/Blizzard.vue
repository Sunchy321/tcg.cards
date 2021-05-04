<template>
    <div class="q-pa-md">
        <div v-if="progress != null" class="q-mb-lg row items-center">
            <div class="q-mr-sm">
                {{ progressLabel }}
            </div>

            <q-linear-progress
                class="flex-grow"
                rounded
                color="primary"
                :indeterminate="progressValue == null"
                :value="progressValue"
                size="15px"
            />
        </div>

        <div class="q-mb-sm">
            API Data
        </div>

        <div class="row q-gutter-md">
            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Metadata</q-item-section>
                    <q-item-section side>
                        <q-btn
                            round dense flat
                            :icon="metadata ? 'mdi-autorenew mdi-spin' : 'mdi-download'"
                            @click="getMetadata"
                        />
                    </q-item-section>
                </q-item>
            </q-list>

            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Card</q-item-section>
                    <q-item-section side>
                        <q-btn
                            round dense flat
                            icon="mdi-download"
                            @click="getCard"
                        />
                    </q-item-section>
                </q-item>
            </q-list>

            <q-list class="col" bordered separator>
                <q-item>
                    <q-item-section>Image</q-item-section>
                    <q-item-section side>
                        <q-btn
                            round dense flat
                            icon="mdi-download"
                            @click="getImage"
                        />
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
import { defineComponent, ref, computed } from 'vue';

import controlSetup from 'setup/control';

interface Progress {
    method: 'get';
    type: 'card' | 'image';
    count: number;
    total: number;
}

export default defineComponent({
    setup() {
        const { controlWs } = controlSetup();

        const progress = ref<Progress|null>(null);
        const metadata = ref(false);

        const progressValue = computed(() => {
            const prog = progress.value;

            if (prog == null) {
                return null;
            }

            return prog.count / prog.total;
        });

        const progressLabel = computed(() => {
            const prog = progress.value;

            if (prog == null) {
                return null;
            }

            return `[${prog.method}] ${prog.type}: ${prog.count}/${prog.total}`;
        });

        const getMetadata = async () => {
            metadata.value = true;

            const ws = controlWs('/hearthstone/blizzard/get-metadata');

            return new Promise((resolve, reject) => {
                ws.onerror = e => {
                    metadata.value = false;
                    reject(e);
                };
                ws.onclose = () => {
                    metadata.value = false;
                    resolve(undefined);
                };
            });
        };

        const getCard = async () => {
            const ws = controlWs('/hearthstone/blizzard/get-card');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    resolve(undefined);
                };
            });
        };

        const getImage = async () => {
            const ws = controlWs('/hearthstone/blizzard/get-image');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    progress.value = JSON.parse(data) as Progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    progress.value = null;
                    resolve(undefined);
                };
            });
        };

        return {
            progress,
            progressValue,
            progressLabel,
            metadata,

            getMetadata,
            getCard,
            getImage,
        };
    },
});
</script>
