<template>
    <q-btn
        :color="actualColor"
        :icon="icon"
        v-bind="{ ...$props, color: actualColor }"
        @click="(...args) => onEvent('click', ...args)"
    />
</template>

<script>
export default {
    props: {
        color: {
            type:    String,
            default: undefined,
        },
        dense: {
            type: Boolean,
        },
        icon: {
            type:    String,
            default: undefined,
        },
        round: {
            type: Boolean,
        },
        size: {
            type:    String,
            default: undefined,
        },
    },

    data() {
        return {
            flickerColor: undefined,
        };
    },

    computed: {
        actualColor() {
            if (this.flickerColor !== undefined) {
                return this.flickerColor;
            } else {
                return this.color;
            }
        },
    },

    methods: {
        async flicker(color, time = 500) {
            this.flickerColor = color;
            await this.$sleep(time);
            this.flickerColor = undefined;
        },

        onEvent(e, ...args) {
            this.$emit(e, ...args);
        },
    },
};
</script>

<style>
</style>
