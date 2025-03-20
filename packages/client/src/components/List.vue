<template>
    <div>
        <div :class="titleClass" class="q-mt-sm">
            <slot name="title" />
            <q-btn
                class="q-ml-sm"
                flat dense round
                icon="mdi-plus"
                @click="insert()"
            />
        </div>

        <div v-for="(v, i) in modelValue" :key="keyOf(v, i)" :class="itemClass">
            <div :class="summaryClass" class="flex items-center">
                <slot name="summary" v-bind="{ value: v, index: i, update: (v: T) => update(v, i) }" />
                <q-btn
                    class="q-ml-sm"
                    icon="mdi-arrow-up"
                    :disable="i === 0"
                    flat dense round
                    @click="moveUp(i)"
                />
                <q-btn
                    icon="mdi-arrow-down"
                    :disable="i === modelValue.length - 1"
                    flat dense round
                    @click="moveDown(i)"
                />
                <q-btn
                    icon="mdi-minus"
                    flat dense round
                    @click="remove(i)"
                />
            </div>

            <slot name="body" v-bind="{ value: v, index: i }" />
        </div>
    </div>
</template>

<script setup lang="ts" generic="T">
type IndexKey<T> = {
    [K in keyof T]: T[K] extends number | string ? K : never;
}[keyof T];

const {
    itemKey, titleClass = '', itemClass = '', summaryClass = '',
} = defineProps<{
    itemKey?:      IndexKey<T>;
    titleClass?:   string;
    itemClass?:    string;
    summaryClass?: string;
}>();

const emit = defineEmits<{
    insert: [];
}>();

const model = defineModel<T[]>({ required: true });

const keyOf = (value: T, index: number) => (itemKey != null ? value[itemKey] : index) as number | string;

const insert = () => { emit('insert'); };

const remove = (i: number) => {
    model.value = [
        ...model.value.slice(0, i),
        ...model.value.slice(i + 1),
    ];
};

const moveUp = (i: number) => {
    if (i === 0) {
        return;
    }

    model.value = [
        ...model.value.slice(0, i - 1),
        model.value[i],
        model.value[i - 1],
        ...model.value.slice(i + 1),
    ];
};

const moveDown = (i: number) => {
    if (i === model.value.length - 1) {
        return;
    }

    model.value = [
        ...model.value.slice(0, i),
        model.value[i + 1],
        model.value[i],
        ...model.value.slice(i + 2),
    ];
};

const update = (v: any, i: number) => {
    model.value = [
        ...model.value.slice(0, i),
        v,
        ...model.value.slice(i + 1),
    ];
};
</script>
