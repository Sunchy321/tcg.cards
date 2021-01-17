<template>
    <q-page class="q-pa-md">
        <div class="q-mb-lg row items-center">
            <q-btn
                class="q-mr-md"
                flat dense round
                icon="mdi-merge"
                @click="loadHsdata"
            />

            <div v-if="progress != null" class="q-mr-sm">
                {{ progressLabel }}
            </div>

            <q-linear-progress
                v-if="progress != null"
                class="flex-grow"
                rounded
                color="primary"
                :indeterminate="progressValue == null"
                :value="progressValue"
                size="15px"
            />
        </div>
        <div class="row justify-between">
            <hsdata-patch
                v-for="p in patches"
                :key="p.version"
                v-bind="p"
                @load-data="loadData"
            />
        </div>
    </q-page>
</template>

<style lang="stylus" scoped>

.flex-grow
    flex-grow 1
    width inherit

</style>

<script>
import HsdataPatch from './HsdataPatch';

import bytes from 'bytes';

export default {
    name: 'Hsdata',

    components: { HsdataPatch },

    data: () => ({
        patches:  [],
        progress: null,
        error:    null,
    }),

    computed: {
        progressValue() {
            const prog = this.progress;

            if (prog == null) {
                return null;
            }

            if (prog.type === 'git') {
                if (prog.totalDeltas != null) {
                    return prog.indexedObjects / prog.totalObjects;
                } else {
                    return prog.receivedObjects / prog.totalObjects;
                }
            } else if (prog.type === 'load') {
                return prog.count / prog.total;
            } else {
                return null;
            }
        },

        progressLabel() {
            const prog = this.progress;

            if (prog.type === 'git') {
                return `${prog.indexedObjects}/${prog.receivedObjects}/${prog.totalObjects} (${bytes(prog.receivedBytes)})`;
            } else if (prog.type === 'load') {
                return `${prog.count}/${prog.total}`;
            } else {
                return null;
            }
        },
    },

    mounted() {
        this.loadData();
    },

    methods: {
        async loadData() {
            const { data } = await this.controlGet('/hearthstone/patches');

            this.patches = data;
        },

        async getHsdata() {
            this.error = null;

            const ws = this.controlWs('/hearthstone/hsdata/get-data');

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

        async loadHsdata() {
            this.error = null;

            const ws = this.controlWs('/hearthstone/hsdata/load-data');

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
