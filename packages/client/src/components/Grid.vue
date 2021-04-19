<template>
    <div ref="root" class="flex justify-between">
        <q-resize-observer @resize="calcGridInfo" />
        <div
            v-for="(v, i) in value" :key="itemKey ? v[itemKey] : i"
            :style="{ width: itemRealWidth + 'px' }"
        >
            <slot v-bind="v" />
        </div>
        <div
            v-for="i in placeholder" :key="i"
            class="placeholder"
            :style="{ width: itemRealWidth + 'px' }"
        />
    </div>
</template>

<script>
export default {
    props: {
        value: {
            type:     Array,
            required: true,
        },

        itemKey: {
            type:    String,
            default: undefined,
        },

        itemWidth: {
            type:     Number,
            required: true,
        },
    },

    data: () => ({
        itemRealWidth: 0,
        itemPerLine:   0,
        placeholder:   0,
    }),

    watch: {
        value: {
            immediate: true,
            handler() {
                this.calcGridInfo();
            },
        },
    },

    methods: {
        calcGridInfo() {
            const root = this.$refs.root;

            if (root == null) {
                return;
            }

            // hard code
            const margin = 16;

            const panelWidth = root.clientWidth;
            const contentWidth = panelWidth - 2 * margin;

            this.itemRealWidth = contentWidth < this.itemWidth ? contentWidth : this.itemWidth;
            this.itemPerLine = Math.floor((panelWidth - margin) / (this.itemRealWidth + margin));

            const reminder = this.value.length % this.itemPerLine;

            this.placeholder = reminder === 0 ? 0 : reminder;
        },
    },
};
</script>

<style>

</style>
