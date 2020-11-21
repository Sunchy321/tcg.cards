<template>
    <div class="q-pa-md">
        <div class="q-mt-xl q-mb-sm">
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
        </div>
    </div>
</template>

<script>
export default {
    data: () => ({
        metadata: false,
    }),

    methods: {
        async getMetadata() {
            this.metadata = true;

            const ws = this.apiWs('/hearthstone/blizzard/get-metadata');

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);
                    this.progress = progress;
                };

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
    },
};
</script>

<style>

</style>
