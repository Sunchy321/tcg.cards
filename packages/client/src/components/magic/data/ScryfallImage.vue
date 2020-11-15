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
                v-for="(s, n) in progress.status"
                :key="n"
                class="single-status" :class="`status-${s}`"
            >{{ n }}</span>
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
    },

    methods: {
        async getImage() {
            this.progress = null;

            const ws = this.imageWs('/magic/card/get', { type: this.type });

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
