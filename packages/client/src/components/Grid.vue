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

const props = withDefaults(defineProps<{
    value: T[];
    itemWidth: number;
    itemKey?: keyof T | undefined;
    itemClass?: string;
}>(), {
    itemKey:   undefined,
    itemClass: '',
});

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

    itemRealWidth.value = contentWidth < props.itemWidth ? contentWidth : props.itemWidth;
    itemPerLine.value = Math.floor((panelWidth - margin) / (itemRealWidth.value + margin));

    const reminder = props.value.length % itemPerLine.value;

    placeholder.value = reminder === 0 ? 0 : itemPerLine.value - reminder;
}

watch(() => props.value.length, calcGridInfo, { immediate: true });

</script>
