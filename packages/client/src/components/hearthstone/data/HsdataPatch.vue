<template>
    <div class="hsdata-patch row items-center">
        <div>{{ version }}</div>

        <q-btn
            class="load-button"
            :class="{ 'is-updated': isUpdated }"
            flat round dense
            icon="mdi-import"
            @click="loadPatch"
        />

        <q-circular-progress
            v-show="progress != null"
            :value="progressValue"
            font-size="8px"
            :max="1"
            :thickness="0.3"
            color="primary"
            track-color="transparent"
        />

        <span v-show="progress != null" class="q-pl-sm">{{ progressLabel }}</span>
    </div>
</template>

<style lang="stylus" scoped>
.hsdata-patch
    width 20%
    padding 10px 5px

.load-button.is-updated
    color green

</style>

<script>
export default {
    name: 'HsdataPatch',

    props: {
        version: {
            type:     String,
            required: true,
        },

        isUpdated: {
            type:     Boolean,
            required: true,
        },
    },

    data: () => ({
        progress: null,
    }),
    computed: {
        progressValue() {
            if (this.progress == null) {
                return 0;
            } else {
                return this.progress.count / this.progress.total;
            }
        },

        progressLabel() {
            if (this.progress == null) {
                return '';
            } else {
                return this.progress.count + '/' + this.progress.total;
            }
        },
    },

    methods: {
        loadPatch() {
            const ws = this.controlWs('/hearthstone/hsdata/load-patch', { version: this.version });

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    if (data.error) {
                        this.error = data;
                        console.error(data);
                    } else {
                        const progress = JSON.parse(data);
                        this.progress = progress;
                    }
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    this.progress = null;
                    this.$emit('load-data');

                    resolve();
                };
            });
        },
    },
};
</script>
