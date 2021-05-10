<template>
    <div ref="root" class="flex justify-between">
        <q-resize-observer @resize="calcGridInfo" />
        <div
            v-for="(v, i) in value" :key="itemKey ? v[itemKey] : i"
            :class="itemClass"
            :style="{ width: itemRealWidth + 'px' }"
        >
            <slot v-bind="v" />
        </div>
        <div
            v-for="i in placeholder" :key="i"
            class="placeholder"
            :class="itemClass"
            :style="{ width: itemRealWidth + 'px' }"
        />
    </div>
</template>

<script lang="ts">
import { PropType, defineComponent, ref, watch } from 'vue';

export default defineComponent({
    props: {
        value: {
            type:     Array as PropType<any[]>,
            required: true,
        },

        itemWidth: {
            type:     Number,
            required: true,
        },

        itemKey: {
            type:    String,
            default: undefined,
        },

        itemClass: {
            type:    String,
            default: '',
        },
    },

    setup(props) {
        const root = ref<HTMLDivElement|null>(null);

        const itemRealWidth = ref(0);
        const itemPerLine = ref(0);
        const placeholder = ref(0);

        function calcGridInfo() {
            if (root.value == null) {
                return;
            }

            // magic number
            const margin = 16;

            const panelWidth = root.value.clientWidth;
            const contentWidth = panelWidth - 2 * margin;

            itemRealWidth.value = contentWidth < props.itemWidth ? contentWidth : props.itemWidth;
            itemPerLine.value = Math.floor((panelWidth - margin) / (itemRealWidth.value + margin));

            const reminder = props.value.length % itemPerLine.value;

            placeholder.value = reminder === 0 ? 0 : itemPerLine.value - reminder;
        }

        watch(() => props.value.length, calcGridInfo, { immediate: true });

        return {
            root,

            itemRealWidth,
            itemPerLine,
            placeholder,

            calcGridInfo,
        };
    },
});
</script>
