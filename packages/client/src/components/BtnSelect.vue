<template>
    <q-btn-group :flat="flat">
        <q-btn
            v-for="o in options" :key="o.value"
            :color="color(o)"
            v-bind="{ flat, dense, ...o }"
            @click="$emit('input', o.value)"
        />
    </q-btn-group>
</template>

<script>
export default {
    name: 'BtnSelect',

    props: {
        value: {
            type:     null,
            required: true,
        },
        options: {
            type:     Array,
            required: true,
        },
        flat:  Boolean,
        dense: Boolean,
    },

    methods: {
        color(o) {
            if (o.color != null || o.class != null) {
                if (this.value !== o.value) {
                    return 'grey-5';
                }
            } else {
                if (this.value === o.value) {
                    return o.color ?? 'primary';
                }
            }
        },
    },
};
</script>

<style>

</style>
