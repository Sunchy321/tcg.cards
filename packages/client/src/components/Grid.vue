<template>
    <div ref="root" class="flex justify-between">
        <q-resize-observer @resize="calcGridInfo" />
        <div
            v-for="(v, i) in value" :key="itemKey ? (v as any)[itemKey] : i"
            :class="itemClass"
            :style="{ width: itemRealWidth + 'px' }"
        >
            <slot v-bind="v" />
        </div>
        <div
            v-for="i in placeholder" :key="'placeholder-' + i"
            class="placeholder"
            :class="itemClass"
            :style="{ width: itemRealWidth + 'px' }"
        />
    </div>
</template>

<script setup lang="ts" generic="T">
import { ref, watch } from 'vue';

const {
    value, itemWidth, itemKey, itemClass = '',
} = defineProps<{
    value: T[];
    itemWidth: number;
    itemKey?: keyof T;
    itemClass?: string;
}>();

const root = ref<HTMLDivElement | null>(null);

const itemRealWidth = ref(0);
const itemPerLine = ref(0);
const placeholder = ref(0);

function calcGridInfo() {
    if (root.value == null) {
        return;
    }

    const margin = 0;

    const panelWidth = root.value.clientWidth;
    const contentWidth = panelWidth - 2 * margin;

    itemRealWidth.value = contentWidth < itemWidth ? contentWidth : itemWidth;
    itemPerLine.value = Math.floor((panelWidth - margin) / (itemRealWidth.value + margin));

    const reminder = value.length % itemPerLine.value;

    placeholder.value = reminder === 0 ? 0 : itemPerLine.value - reminder;
}

watch(() => value.length, calcGridInfo, { immediate: true });

</script>
