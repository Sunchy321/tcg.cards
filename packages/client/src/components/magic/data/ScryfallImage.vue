<template>
    <div class="q-pa-md">
        <div class="row justify-center">
            <q-btn-toggle
                v-model="type"
                outline dense
                :options="typeOptions"
            />

            <q-btn
                class="q-ml-md"
                flat dense round
                icon="mdi-play"
                @click="getImage"
            />
        </div>

        <div v-if="progress != null" class="q-my-md row justify-center">
            {{ progress.current.set }}:{{ progress.current.lang }}
            {{ progress.overall.count }}/{{ progress.overall.total }}
        </div>

        <div v-if="progress != null">
            <span
                v-for="k in statusKey"
                :key="k"
                class="single-status" :class="`status-${status[k]}`"
            >{{ k }}</span>
        </div>
    </div>
</template>

<style lang="stylus" scoped>
.single-status
    display inline-flex
    justify-content center
    align-items center

    width 35px
    height 35px
    font-size 10px

    &.status-success
        background-color green
        color white

    &.status-working
        background-color blue
        color white

    &.status-failed
        background-color red
        color white

    &.status-stopped
        background-color yellow
</style>

<script>

export default {
    data: () => ({
        type: 'png',

        progress: null,
    }),

    computed: {
        types() {
            return ['png', 'large', 'normal', 'small', 'art_crop', 'border_crop'];
        },

        typeOptions() {
            return this.types.map(t => ({
                value: t, label: t,
            }));
        },

        status() {
            return this.progress?.status ?? {};
        },

        statusKey() {
            return Object.keys(this.status).sort((a, b) => {
                const ma = /^(.*?)(?:-\d|[ab])?$/.exec(a)[1];
                const mb = /^(.*?)(?:-\d|[ab])?$/.exec(b)[1];

                const len = Math.max(ma.length, mb.length);

                const pa = ma.padStart(len, '0');
                const pb = mb.padStart(len, '0');

                return pa < pb ? -1 : pa > pb ? 1 : 0;
            });
        },
    },

    methods: {
        async getImage() {
            this.progress = null;

            const ws = this.controlWs('/magic/image/get', { type: this.type });

            return new Promise((resolve, reject) => {
                ws.onmessage = ({ data }) => {
                    const progress = JSON.parse(data);

                    if (progress?.current?.set != null) {
                        this.progress = progress;
                    }
                };

                ws.onerror = reject;
                ws.onclose = () => {
                    resolve();
                };
            });
        },
    },
};
</script>

<style>

</style>
