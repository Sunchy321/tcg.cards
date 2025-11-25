<template>
    <div>
        <div :class="titleClass" class="q-mt-sm">
            <slot name="title" />
            <q-btn class="q-ml-sm" flat dense round icon="mdi-plus" @click="insert()" />
        </div>

        <div
            v-for="(v, i) in modelValue"
            :key="keyOf(v, i)"
            :class="[itemClass, draggingIndex === i ? 'dragging' : '', overIndex === i ? 'drag-over' : '']"
            @dragover.prevent="enableDrag && onDragOver(i)"
            @drop.prevent="enableDrag && onDrop(i)"
        >
            <div :class="summaryClass" class="flex items-center">
                <slot name="summary" v-bind="{ value: v, index: i, update: (v: T) => update(v, i) }" />
                <q-btn
                    v-if="enableDrag"
                    class="q-ml-sm drag-handle"
                    icon="mdi-drag-vertical"
                    flat dense round
                    :disable="modelValue.length < 2"
                    draggable="true"
                    @dragstart="onDragStart(i)"
                />
                <q-btn icon="mdi-minus" flat dense round @click="remove(i)" />
            </div>

            <slot name="body" v-bind="{ value: v, index: i }" />
        </div>
    </div>
</template>

<script setup lang="ts" generic="T">
import { ref } from 'vue';
type IndexKey<T> = { [K in keyof T]: T[K] extends number | string ? K : never }[keyof T];

const props = withDefaults(
    defineProps<{
        itemKey?:      IndexKey<T>;
        titleClass?:   string;
        itemClass?:    string;
        summaryClass?: string;
        enableDrag?:   boolean;
    }>(),
    {
        itemKey:      undefined,
        titleClass:   '',
        itemClass:    '',
        summaryClass: '',
        enableDrag:   true,
    },
);

const { itemKey, titleClass, itemClass, summaryClass, enableDrag } = props;

const emit = defineEmits<{ insert: [] }>();
const model = defineModel<T[]>({ required: true });

const keyOf = (value: T, index: number) => (itemKey != null ? (value as any)[itemKey] : index) as number | string;
const insert = () => { emit('insert'); };
const remove = (i: number) => {
    model.value = [...model.value.slice(0, i), ...model.value.slice(i + 1)];
};
const update = (v: any, i: number) => {
    model.value = [...model.value.slice(0, i), v, ...model.value.slice(i + 1)];
};

// 拖拽相关状态
const draggingIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);
const onDragStart = (i: number) => { draggingIndex.value = i; };
const onDragOver = (i: number) => { overIndex.value = i; };
const onDrop = (i: number) => {
    if (draggingIndex.value == null || draggingIndex.value === i) {
        draggingIndex.value = null;
        overIndex.value = null;
        return;
    }
    const list = [...model.value];
    const item = list.splice(draggingIndex.value, 1)[0];
    list.splice(i, 0, item);
    model.value = list;
    draggingIndex.value = null;
    overIndex.value = null;
};
</script>

<style scoped>
.dragging { opacity: 0.5; }
.drag-over { outline: 2px dashed var(--q-primary); }
.drag-handle { cursor: grab; }
.drag-handle:active { cursor: grabbing; }
</style>
