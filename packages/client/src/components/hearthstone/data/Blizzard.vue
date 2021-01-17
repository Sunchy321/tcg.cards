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

<style lang="stylus" scoped>

.flex-grow
    flex-grow 1
    width inherit

</style>

<script>
export default {
    data: () => ({
        progress: null,
        metadata: false,
    }),

    computed: {
        progressValue() {
            const prog = this.progress;

            if (prog == null) {
                return null;
            }

            return prog.count / prog.total;
        },

        progressLabel() {
            const prog = this.progress;

            if (prog == null) {
                return null;
            }

            return `[${prog.method}] ${prog.type}: ${prog.count}/${prog.total}`;
        },
    },

    methods: {
        async getMetadata() {
            this.metadata = true;

            const ws = this.controlWs('/hearthstone/blizzard/get-metadata');

            return new Promise((resolve, reject) => {
                ws.onerror = e => {
                    this.metadata = false;
                    reject(e);
                };
                ws.onclose = () => {
                    this.metadata = false;
                    resolve();
                };
            });
        },

        async getCard() {
            const ws = this.controlWs('/hearthstone/blizzard/get-card');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);
                    this.progress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.progress = null;
                    resolve();
                };
            });
        },

        async getImage() {
            const ws = this.controlWs('/hearthstone/blizzard/get-image');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);
                    this.progress = progress;
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.progress = null;
                    resolve();
                };
            });
        },
    },
};
</script>

<style>

</style>
