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

        <div v-for="(v, i) in modelValue" :key="itemKey ? v[itemKey] : i" :class="itemClass">
            <div :class="summaryClass" class="flex items-center">
                <slot name="summary" v-bind="{ value: v, index: i, update: (v: any) => update(v, i) }" />
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

<script lang="ts">
import { PropType, defineComponent } from 'vue';

export default defineComponent({
    name: 'List',

    props: {
        modelValue: {
            type:     Array as PropType<any[]>,
            required: true,
        },
        itemKey: {
            type:    String,
            default: undefined,
        },
        titleClass:   { type: String, default: '' },
        itemClass:    { type: String, default: '' },
        summaryClass: { type: String, default: '' },
    },

    emits: ['update:modelValue', 'insert'],

    setup(props, { emit }) {
        const insert = () => { emit('insert'); };

        const remove = (i: number) => {
            emit('update:modelValue', [
                ...props.modelValue.slice(0, i),
                ...props.modelValue.slice(i + 1),
            ]);
        };

        const moveUp = (i: number) => {
            if (i === 0) {
                return;
            }

            emit('update:modelValue', [
                ...props.modelValue.slice(0, i - 1),
                props.modelValue[i],
                props.modelValue[i - 1],
                ...props.modelValue.slice(i + 1),
            ]);
        };

        const moveDown = (i: number) => {
            if (i === props.modelValue.length - 1) {
                return;
            }

            emit('update:modelValue', [
                ...props.modelValue.slice(0, i),
                props.modelValue[i + 1],
                props.modelValue[i],
                ...props.modelValue.slice(i + 2),
            ]);
        };

        const update = (v: any, i: number) => {
            emit('update:modelValue', [
                ...props.modelValue.slice(0, i),
                v,
                ...props.modelValue.slice(i + 1),
            ]);
        };

        return {
            insert,
            remove,
            moveUp,
            moveDown,
            update,
        };
    },
});

</script>
